"""Steer: a living split of a fund, kept on course by a community that spends
as little attention as possible.

Python standard library only. Run:  python server.py 5501
Environment: DATA (folder for steer.db; default ./data).

Mechanism (the constitution is in constitution.json):
  * The allocation is a vector of log-weights; shares are their softmax.
    It starts from the AI layer's weights.
  * Anyone may flag a project as "too low" or "too high". Flags are signed and
    standing; opposite flags cancel. A maintainer's flag on their own project
    counts half. Flags set the agenda only: they never move money.
  * Members get cards. A card shows two projects and their current amounts and
    asks: more to A, about right, or more to B. One answer moves the ratio by one
    fixed step. Maintainers never get cards about their own project.
  * Part of the cards go to flagged projects, the rest by money at stake.
  * When the net flags on a project reach a threshold, it is escalated: the next
    cards all go to it until a small panel has answered.
  * Each member has a daily cap of answers.
  * A simulated community (optional) answers cards in the background, so the
    split is alive even when few people are around. Its answers are logged as
    simulated.
"""
import json, math, os, random, secrets, sqlite3, sys, threading, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.environ.get("DATA", os.path.join(HERE, "data"))
os.makedirs(DATA, exist_ok=True)
DB = os.path.join(DATA, "steer.db")
LOCK = threading.RLock()
SEED = json.load(open(os.path.join(HERE, "seed.json"), encoding="utf-8"))
CONST = json.load(open(os.path.join(HERE, "constitution.json"), encoding="utf-8"))


def db():
    c = sqlite3.connect(DB, check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


CON = db()


def init():
    with LOCK:
        c = CON
        c.executescript("""
        create table if not exists items(k integer primary key, id text unique, name text, org text,
            description text, ai_weight real, x real, escalated integer default 0);
        create table if not exists members(token text primary key, name text, role text, item integer,
            created real, simulated integer default 0, view text);
        create table if not exists flags(item integer, member text, dir integer, weight real, ts real,
            primary key(item, member));
        create table if not exists events(id integer primary key autoincrement, ts real, kind text,
            member text, a integer, b integer, value real, note text, simulated integer default 0);
        create table if not exists answers(member text, day text, n integer, primary key(member, day));
        """)
        if c.execute("select count(*) from items").fetchone()[0] == 0:
            for k, it in enumerate(SEED["items"]):
                x = math.log(it["ai_weight"])
                c.execute("insert into items(k,id,name,org,description,ai_weight,x) values(?,?,?,?,?,?,?)",
                          (k, it["id"], it["name"], it["org"], it["description"], it["ai_weight"], x))
            c.commit()
        make_sim_members()


def items():
    return [dict(r) for r in CON.execute("select * from items order by k")]


def shares(its):
    xs = [it["x"] for it in its]
    mx = max(xs)
    e = [math.exp(v - mx) for v in xs]
    s = sum(e)
    return [v / s for v in e]


def net_flags():
    out = {}
    for r in CON.execute("select item, sum(dir*weight) as s from flags group by item"):
        out[r["item"]] = r["s"] or 0.0
    return out


def log(kind, member=None, a=None, b=None, value=None, note=None, simulated=0):
    CON.execute("insert into events(ts,kind,member,a,b,value,note,simulated) values(?,?,?,?,?,?,?,?)",
                (time.time(), kind, member, a, b, value, note, simulated))


def today():
    return time.strftime("%Y-%m-%d", time.gmtime())


# ---------------------------------------------------------------- policy
def pick_card(member):
    """Chooses the pair for a member's next card (the attention policy)."""
    its = items()
    m = len(its)
    sh = shares(its)
    own = member["item"] if member["item"] is not None else -1
    allowed = [k for k in range(m) if k != own]
    esc = [it["k"] for it in its if it["escalated"] > 0 and it["k"] != own]
    if esc:
        a = random.choice(esc)
    else:
        nf = net_flags()
        flagged = {k: abs(v) for k, v in nf.items() if abs(v) > 1e-9 and k != own}
        if flagged and random.random() < CONST["flag_mix"]:
            ks, ws = zip(*flagged.items())
            a = random.choices(ks, weights=ws)[0]
        else:
            a = random.choices(allowed, weights=[sh[k] for k in allowed])[0]
    b = a
    while b == a or b == own:
        b = random.randrange(m)
    return a, b


def card_json(a, b):
    its = items()
    sh = shares(its)
    fund = CONST["fund"]
    def one(k):
        it = its[k]
        return dict(k=k, id=it["id"], name=it["name"], org=it["org"], description=it["description"],
                    share=sh[k], amount=round(sh[k] * fund))
    return dict(a=one(a), b=one(b), ratio=sh[a] / sh[b])


def apply_answer(member_token, a, b, ans, simulated=0):
    step = CONST["step"]
    CON.execute("update items set x = x + ? where k = ?", (step * ans / 2, a))
    CON.execute("update items set x = x - ? where k = ?", (step * ans / 2, b))
    # a verdict cools down standing flags on both projects
    CON.execute("update flags set weight = weight * ? where item in (?, ?)", (CONST["verdict_cooling"], a, b))
    for k in (a, b):
        r = CON.execute("select escalated from items where k=?", (k,)).fetchone()
        if r["escalated"] > 0:
            CON.execute("update items set escalated = escalated - 1 where k=?", (k,))
    log("answer", member_token, a, b, ans, None, simulated)


def check_escalation(k):
    nf = net_flags().get(k, 0.0)
    if abs(nf) >= CONST["escalate_at"]:
        CON.execute("update items set escalated = ? where k = ?", (CONST["escalation_panel"], k))
        CON.execute("delete from flags where item = ?", (k,))
        log("escalation", None, k, None, nf, f"net flags {nf:+.1f}: a panel of {CONST['escalation_panel']} answers is convened")


# ---------------------------------------------------------------- simulated community
def make_sim_members():
    n = CONST["sim_members"]
    have = CON.execute("select count(*) from members where simulated=1").fetchone()[0]
    if have >= n:
        return
    its = items()
    rnd = random.Random(7)
    # Simulated views: the AI layer's log-weights plus a shared correction on a few
    # projects (what the community knows and the AI layer misses) plus personal noise.
    m = len(its)
    blind = rnd.sample(range(m), max(1, m // 12))
    corr = {k: rnd.choice([-1.2, 1.2]) for k in blind}
    for j in range(have, n):
        view = [math.log(it["ai_weight"]) + corr.get(it["k"], 0.0) + rnd.gauss(0, 0.4) for it in its]
        maint = rnd.randrange(m) if j < n // 3 else None
        if maint is not None:
            view[maint] += 1.0
        CON.execute("insert into members(token,name,role,item,created,simulated,view) values(?,?,?,?,?,1,?)",
                    (f"sim-{j}", f"simulated member {j+1}", "maintainer" if maint is not None else "member",
                     maint, time.time(), json.dumps(view)))
    CON.commit()


def sim_tick():
    rate = CONST["sim_answers_per_hour"]
    if rate <= 0:
        return
    with LOCK:
        sims = [dict(r) for r in CON.execute("select * from members where simulated=1")]
        if not sims:
            return
        # a simulated member looks and maybe flags
        mem = random.choice(sims)
        view = json.loads(mem["view"])
        its = items()
        xs = [it["x"] for it in its]
        mv, mx = sum(view) / len(view), sum(xs) / len(xs)
        if random.random() < 0.3:
            k = mem["item"] if mem["item"] is not None else random.randrange(len(its))
            gap = (view[k] - mv) - (xs[k] - mx)
            old = CON.execute("select dir from flags where item=? and member=?", (k, mem["token"])).fetchone()
            if abs(gap) > 0.7 and not (old and old["dir"] == (1 if gap > 0 else -1)):
                w = CONST["self_flag_weight"] if mem["item"] == k else 1.0
                CON.execute("insert or replace into flags(item,member,dir,weight,ts) values(?,?,?,?,?)",
                            (k, mem["token"], 1 if gap > 0 else -1, w, time.time()))
                log("flag", mem["token"], k, None, 1 if gap > 0 else -1, None, 1)
                check_escalation(k)
        # and answers one card
        a, b = pick_card(mem)
        d = (view[a] - view[b]) + random.gauss(0, 0.4) - (xs[a] - xs[b])
        ans = 0 if abs(d) < 0.1 else (1 if d > 0 else -1)
        apply_answer(mem["token"], a, b, ans, simulated=1)
        CON.commit()


def sim_loop():
    while True:
        rate = CONST["sim_answers_per_hour"]
        time.sleep(3600.0 / rate if rate > 0 else 60)
        try:
            sim_tick()
        except Exception as e:  # keep the loop alive
            print("sim error", e, file=sys.stderr)


# ---------------------------------------------------------------- http
class H(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode()
        elif isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype + ("; charset=utf-8" if "text" in ctype or "json" in ctype else ""))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass

    def member(self, token):
        if not token:
            return None
        r = CON.execute("select * from members where token=? and simulated=0", (token,)).fetchone()
        return dict(r) if r else None

    def do_GET(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        p = u.path.rstrip("/") or "/"
        if p in ("/", "/index.html"):
            return self._send(200, open(os.path.join(HERE, "index.html"), "rb").read(), "text/html")
        if p == "/about":
            return self._send(200, open(os.path.join(HERE, "about.html"), "rb").read(), "text/html")
        with LOCK:
            if p == "/api/state":
                its = items(); sh = shares(its); nf = net_flags()
                rows = [dict(k=it["k"], id=it["id"], name=it["name"], org=it["org"], share=sh[it["k"]],
                             ai_share=it["ai_weight"], amount=round(sh[it["k"]] * CONST["fund"]),
                             flags=round(nf.get(it["k"], 0.0), 2), escalated=it["escalated"]) for it in its]
                rows.sort(key=lambda r: -r["share"])
                ev = [dict(r) for r in CON.execute("select * from events order by id desc limit 60")]
                names = {r["k"]: r["name"] for r in its}
                for e in ev:
                    e["a_name"] = names.get(e["a"]); e["b_name"] = names.get(e["b"])
                    e["member"] = None if not e["member"] else ("simulated" if e["simulated"] else "member")
                stats = dict(
                    answers=CON.execute("select count(*) from events where kind='answer'").fetchone()[0],
                    answers_people=CON.execute("select count(*) from events where kind='answer' and simulated=0").fetchone()[0],
                    flags=CON.execute("select count(*) from flags").fetchone()[0],
                    escalations=CON.execute("select count(*) from events where kind='escalation'").fetchone()[0],
                    members=CON.execute("select count(*) from members where simulated=0").fetchone()[0],
                    moved=0.5 * sum(abs(sh[it["k"]] - it["ai_weight"]) for it in its))
                return self._send(200, dict(items=rows, events=ev, stats=stats, constitution=CONST))
            if p == "/api/card":
                mem = self.member(q.get("token"))
                if not mem:
                    return self._send(401, dict(error="join first"))
                n = CON.execute("select n from answers where member=? and day=?", (mem["token"], today())).fetchone()
                used = n["n"] if n else 0
                if used >= CONST["daily_cap"]:
                    return self._send(200, dict(done=True, used=used, cap=CONST["daily_cap"]))
                a, b = pick_card(mem)
                return self._send(200, dict(card=card_json(a, b), used=used, cap=CONST["daily_cap"]))
            if p == "/api/me":
                mem = self.member(q.get("token"))
                return self._send(200, dict(member=mem and dict(name=mem["name"], role=mem["role"], item=mem["item"])))
        return self._send(404, dict(error="not found"))

    def do_POST(self):
        u = urlparse(self.path)
        p = u.path.rstrip("/")
        try:
            n = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            return self._send(400, dict(error="bad json"))
        with LOCK:
            if p == "/api/join":
                name = str(body.get("name", "")).strip()[:40]
                if not name:
                    return self._send(400, dict(error="Enter a name"))
                item = body.get("item")
                item = int(item) if item not in (None, "", -1, "-1") else None
                tok = secrets.token_urlsafe(16)
                CON.execute("insert into members(token,name,role,item,created) values(?,?,?,?,?)",
                            (tok, name, "maintainer" if item is not None else "member", item, time.time()))
                log("join", tok, item, None, None, "maintainer" if item is not None else "member")
                CON.commit()
                return self._send(200, dict(token=tok))
            mem = self.member(body.get("token"))
            if not mem:
                return self._send(401, dict(error="join first"))
            if p == "/api/answer":
                a, b, ans = int(body["a"]), int(body["b"]), int(body["answer"])
                if ans not in (-1, 0, 1) or a == b or mem["item"] in (a, b):
                    return self._send(400, dict(error="invalid answer"))
                r = CON.execute("select n from answers where member=? and day=?", (mem["token"], today())).fetchone()
                used = r["n"] if r else 0
                if used >= CONST["daily_cap"]:
                    return self._send(200, dict(done=True))
                CON.execute("insert or replace into answers(member,day,n) values(?,?,?)", (mem["token"], today(), used + 1))
                apply_answer(mem["token"], a, b, ans)
                CON.commit()
                return self._send(200, dict(ok=True, used=used + 1))
            if p == "/api/flag":
                k, d = int(body["item"]), int(body["dir"])
                if d not in (-1, 1, 0):
                    return self._send(400, dict(error="invalid flag"))
                if d == 0:
                    CON.execute("delete from flags where item=? and member=?", (k, mem["token"]))
                else:
                    w = CONST["self_flag_weight"] if mem["item"] == k else 1.0
                    old = CON.execute("select dir from flags where item=? and member=?", (k, mem["token"])).fetchone()
                    if not old or old["dir"] != d:
                        CON.execute("insert or replace into flags(item,member,dir,weight,ts) values(?,?,?,?,?)",
                                    (k, mem["token"], d, w, time.time()))
                        log("flag", mem["token"], k, None, d)
                        check_escalation(k)
                CON.commit()
                return self._send(200, dict(ok=True))
            if p == "/api/propose":
                text = str(body.get("text", "")).strip()[:500]
                if not text:
                    return self._send(400, dict(error="Write the proposal first"))
                log("proposal", mem["token"], None, None, None, text)
                CON.commit()
                return self._send(200, dict(ok=True))
        return self._send(404, dict(error="not found"))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5501
    init()
    threading.Thread(target=sim_loop, daemon=True).start()
    print(f"steer on 127.0.0.1:{port}, data in {DATA}")
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
