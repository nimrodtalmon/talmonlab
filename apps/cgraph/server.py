"""Contribution Graph: contribute, curate, export a front.

Standard library only. Usage: python server.py [port]
Data: SQLite file in $DATA (default ./data).
"""
import json
import os
import secrets
import sqlite3
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4801
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.environ.get("DATA", os.path.join(HERE, "data"))
os.makedirs(DATA, exist_ok=True)
DB_PATH = os.path.join(DATA, "cgraph.db")
LOCK = threading.Lock()
VENDOR = {"cytoscape.min.js", "dagre.min.js", "cytoscape-dagre.js"}

TYPES = ["problem", "assumption", "model", "theorem", "algorithm",
         "dataset", "experiment", "claim"]

# Which labels an arc from a contribution of one type to another may carry.
# "builds on" is always allowed.
SCHEMA = {
    ("model", "problem"): ["addresses"],
    ("model", "model"): ["extends", "generalizes"],
    ("model", "assumption"): ["relies on"],
    ("theorem", "model"): ["about"],
    ("theorem", "assumption"): ["relies on"],
    ("theorem", "theorem"): ["uses", "generalizes"],
    ("theorem", "algorithm"): ["analyzes"],
    ("algorithm", "problem"): ["solves"],
    ("algorithm", "model"): ["works in"],
    ("algorithm", "algorithm"): ["improves"],
    ("experiment", "model"): ["validates", "refutes"],
    ("experiment", "dataset"): ["uses"],
    ("experiment", "algorithm"): ["evaluates"],
    ("experiment", "claim"): ["supports", "refutes"],
    ("experiment", "theorem"): ["illustrates"],
    ("claim", "theorem"): ["follows from"],
    ("claim", "experiment"): ["follows from"],
    ("dataset", "problem"): ["addresses"],
}
GENERIC = "builds on"


def labels(src_type, dst_type):
    return SCHEMA.get((src_type, dst_type), []) + [GENERIC]


def db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def init():
    with db() as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS contributions(
            id INTEGER PRIMARY KEY, type TEXT, title TEXT, content TEXT,
            author TEXT, created REAL);
        CREATE TABLE IF NOT EXISTS arcs(
            id INTEGER PRIMARY KEY, src INTEGER, dst INTEGER, label TEXT,
            author TEXT, declared INTEGER, created REAL);
        CREATE TABLE IF NOT EXISTS curators(
            id INTEGER PRIMARY KEY, name TEXT, key TEXT, created REAL);
        CREATE TABLE IF NOT EXISTS accepted(
            curator INTEGER, kind TEXT, item INTEGER,
            PRIMARY KEY(curator, kind, item));
        """)


class Bad(Exception):
    pass


def text(v, name, lo, hi):
    if not isinstance(v, str):
        raise Bad(f"{name} is missing")
    v = v.strip()
    if not lo <= len(v) <= hi:
        raise Bad(f"{name} must have {lo}-{hi} characters")
    return v


def load(con):
    cs = {r["id"]: dict(r) for r in con.execute("SELECT * FROM contributions")}
    arcs = {r["id"]: dict(r) for r in con.execute("SELECT * FROM arcs")}
    return cs, arcs


def graph(con):
    cs, arcs = load(con)
    curators = [{"id": r["id"], "name": r["name"]}
                for r in con.execute("SELECT id, name FROM curators ORDER BY id")]
    return {"contributions": list(cs.values()), "arcs": list(arcs.values()),
            "curators": curators, "types": TYPES,
            "schema": [{"src": s, "dst": d, "labels": l} for (s, d), l in SCHEMA.items()],
            "generic": GENERIC}


def reaches(arcs, start, goal):
    out = {}
    for a in arcs.values():
        out.setdefault(a["src"], []).append(a["dst"])
    seen, stack = set(), [start]
    while stack:
        x = stack.pop()
        if x == goal:
            return True
        if x in seen:
            continue
        seen.add(x)
        stack.extend(out.get(x, []))
    return False


def add_contribution(con, body):
    typ = body.get("type")
    if typ not in TYPES:
        raise Bad("unknown type")
    title = text(body.get("title"), "title", 1, 120)
    content = text(body.get("content", ""), "content", 0, 4000)
    author = text(body.get("author"), "name", 1, 60)
    cs, _ = load(con)
    wanted = body.get("arcs") or []
    if not isinstance(wanted, list) or len(wanted) > 20:
        raise Bad("too many arcs")
    seen = set()
    for w in wanted:
        dst = w.get("dst")
        if dst not in cs:
            raise Bad("arc to an unknown contribution")
        if w.get("label") not in labels(typ, cs[dst]["type"]):
            raise Bad(f"label not allowed from {typ} to {cs[dst]['type']}")
        if (dst, w["label"]) in seen:
            raise Bad("duplicate arc")
        seen.add((dst, w["label"]))
    now = time.time()
    cur = con.execute("INSERT INTO contributions(type,title,content,author,created) VALUES(?,?,?,?,?)",
                      (typ, title, content, author, now))
    cid = cur.lastrowid
    for w in wanted:
        con.execute("INSERT INTO arcs(src,dst,label,author,declared,created) VALUES(?,?,?,?,1,?)",
                    (cid, w["dst"], w["label"], author, now))
    return {"id": cid}


def add_arc(con, body):
    cs, arcs = load(con)
    src, dst = body.get("src"), body.get("dst")
    if src not in cs or dst not in cs:
        raise Bad("unknown contribution")
    if src == dst:
        raise Bad("an arc needs two different contributions")
    label = body.get("label")
    if label not in labels(cs[src]["type"], cs[dst]["type"]):
        raise Bad(f"label not allowed from {cs[src]['type']} to {cs[dst]['type']}")
    if any(a["src"] == src and a["dst"] == dst and a["label"] == label for a in arcs.values()):
        raise Bad("this arc already exists")
    if reaches(arcs, dst, src):
        raise Bad("this arc would create a cycle")
    author = text(body.get("author"), "name", 1, 60)
    cur = con.execute("INSERT INTO arcs(src,dst,label,author,declared,created) VALUES(?,?,?,?,0,?)",
                      (src, dst, label, author, time.time()))
    return {"id": cur.lastrowid}


def add_curator(con, body):
    name = text(body.get("name"), "name", 1, 60)
    key = secrets.token_urlsafe(18)
    cur = con.execute("INSERT INTO curators(name,key,created) VALUES(?,?,?)", (name, key, time.time()))
    return {"id": cur.lastrowid, "name": name, "key": key}


def accepted_sets(con, cid):
    rows = con.execute("SELECT kind, item FROM accepted WHERE curator=?", (cid,)).fetchall()
    return ({r["item"] for r in rows if r["kind"] == "c"},
            {r["item"] for r in rows if r["kind"] == "a"})


def front(arcs, acc_c, acc_a):
    built_on = {arcs[a]["dst"] for a in acc_a if a in arcs}
    return sorted(c for c in acc_c if c not in built_on)


def curator_view(con, cid):
    row = con.execute("SELECT id, name FROM curators WHERE id=?", (cid,)).fetchone()
    if not row:
        raise Bad("unknown curator")
    _, arcs = load(con)
    acc_c, acc_a = accepted_sets(con, cid)
    return {"id": row["id"], "name": row["name"], "contributions": sorted(acc_c),
            "arcs": sorted(acc_a), "front": front(arcs, acc_c, acc_a)}


def check_key(con, cid, key):
    row = con.execute("SELECT key FROM curators WHERE id=?", (cid,)).fetchone()
    if not row:
        raise Bad("unknown curator")
    if not isinstance(key, str) or not secrets.compare_digest(row["key"], key):
        raise Bad("wrong curator key")


def closure_up(cs, arcs, kind, item):
    """What accepting (kind, item) also accepts: everything it builds on."""
    add_c, add_a = set(), set()
    stack = []
    if kind == "a":
        add_a.add(item)
        stack += [arcs[item]["src"], arcs[item]["dst"]]
    else:
        stack.append(item)
    while stack:
        c = stack.pop()
        if c in add_c:
            continue
        add_c.add(c)
        if cs[c]["type"] == "assumption":
            continue
        for a in arcs.values():
            if a["src"] == c and a["declared"]:
                add_a.add(a["id"])
                stack.append(a["dst"])
    return add_c, add_a


def closure_down(cs, arcs, acc_c, acc_a, kind, item):
    """What un-accepting (kind, item) also removes: everything built on it."""
    rem_c, rem_a = set(), set()
    stack = []
    if kind == "a":
        rem_a.add(item)
        if arcs[item]["declared"]:
            stack.append(arcs[item]["src"])
    else:
        stack.append(item)
    while stack:
        c = stack.pop()
        if c in rem_c or c not in acc_c:
            continue
        rem_c.add(c)
        for a in arcs.values():
            if a["id"] in acc_a and (a["src"] == c or a["dst"] == c):
                rem_a.add(a["id"])
            if (a["dst"] == c and a["declared"] and a["src"] in acc_c
                    and cs[a["src"]]["type"] != "assumption"):
                stack.append(a["src"])
    return rem_c, rem_a


def curate(con, cid, body, accept):
    check_key(con, cid, body.get("key"))
    cs, arcs = load(con)
    kind, item = body.get("kind"), body.get("item")
    if kind not in ("c", "a") or item not in (cs if kind == "c" else arcs):
        raise Bad("unknown item")
    acc_c, acc_a = accepted_sets(con, cid)
    if accept:
        add_c, add_a = closure_up(cs, arcs, kind, item)
        if body.get("preview"):
            return {"contributions": sorted(add_c - acc_c), "arcs": sorted(add_a - acc_a)}
        for c in add_c:
            con.execute("INSERT OR IGNORE INTO accepted VALUES(?,?,?)", (cid, "c", c))
        for a in add_a:
            con.execute("INSERT OR IGNORE INTO accepted VALUES(?,?,?)", (cid, "a", a))
    else:
        rem_c, rem_a = closure_down(cs, arcs, acc_c, acc_a, kind, item)
        if body.get("preview"):
            return {"contributions": sorted(rem_c), "arcs": sorted(rem_a & acc_a)}
        for c in rem_c:
            con.execute("DELETE FROM accepted WHERE curator=? AND kind='c' AND item=?", (cid, c))
        for a in rem_a:
            con.execute("DELETE FROM accepted WHERE curator=? AND kind='a' AND item=?", (cid, a))
    return curator_view(con, cid)


def export(con, cid):
    view = curator_view(con, cid)
    cs, arcs = load(con)
    return {
        "curator": view["name"],
        "exported": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "front": view["front"],
        "contributions": [{k: cs[c][k] for k in ("id", "type", "title", "content", "author")}
                          for c in view["contributions"]],
        "arcs": [{k: arcs[a][k] for k in ("id", "src", "dst", "label")} for a in view["arcs"]],
    }


# --- crude rate limit on writes ---------------------------------------------
WRITES = {}


def allow(ip, limit=120, window=600):
    now = time.time()
    hist = [t for t in WRITES.get(ip, []) if now - t < window]
    if len(hist) >= limit:
        WRITES[ip] = hist
        return False
    hist.append(now)
    WRITES[ip] = hist
    return True


class Handler(BaseHTTPRequestHandler):
    server_version = "cgraph"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (time.strftime("%Y-%m-%d %H:%M:%S"), fmt % args))

    def send(self, code, obj=None, body=None, ctype="application/json", extra=None):
        data = body if body is not None else json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        extra = extra or {}
        if "Cache-Control" not in extra:
            self.send_header("Cache-Control", "no-store")
        for k, v in extra.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def parts(self):
        return [p for p in urlparse(self.path).path.split("/") if p]

    def do_GET(self):
        p = self.parts()
        try:
            if p in ([], ["index.html"]):
                with open(os.path.join(HERE, "index.html"), "rb") as f:
                    return self.send(200, body=f.read(), ctype="text/html; charset=utf-8")
            if len(p) == 2 and p[0] == "vendor" and p[1] in VENDOR:
                with open(os.path.join(HERE, "vendor", p[1]), "rb") as f:
                    return self.send(200, body=f.read(), ctype="application/javascript",
                                     extra={"Cache-Control": "public, max-age=86400"})
            with LOCK, db() as con:
                if p == ["api", "graph"]:
                    return self.send(200, graph(con))
                if len(p) == 3 and p[:2] == ["api", "curator"]:
                    return self.send(200, curator_view(con, int(p[2])))
                if len(p) == 4 and p[:2] == ["api", "curator"] and p[3] == "export":
                    data = export(con, int(p[2]))
                    return self.send(200, body=json.dumps(data, indent=2).encode(), extra={
                        "Content-Disposition": f'attachment; filename="front-{int(p[2])}.json"'})
            self.send(404, {"error": "not found"})
        except (Bad, ValueError) as e:
            self.send(400, {"error": str(e)})

    def do_POST(self):
        p = self.parts()
        ip = self.headers.get("X-Forwarded-For", self.client_address[0]).split(",")[0].strip()
        if not allow(ip):
            return self.send(429, {"error": "too many requests; try again later"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
            if n > 20000:
                raise Bad("request too large")
            body = json.loads(self.rfile.read(n) or b"{}")
            if not isinstance(body, dict):
                raise Bad("bad request")
            with LOCK, db() as con:
                if p == ["api", "contribution"]:
                    return self.send(200, add_contribution(con, body))
                if p == ["api", "arc"]:
                    return self.send(200, add_arc(con, body))
                if p == ["api", "curator"]:
                    return self.send(200, add_curator(con, body))
                if len(p) == 4 and p[:2] == ["api", "curator"] and p[3] in ("accept", "unaccept", "check"):
                    cid = int(p[2])
                    if p[3] == "check":
                        check_key(con, cid, body.get("key"))
                        return self.send(200, {"ok": True})
                    return self.send(200, curate(con, cid, body, p[3] == "accept"))
            self.send(404, {"error": "not found"})
        except (Bad, ValueError, KeyError, TypeError) as e:
            self.send(400, {"error": str(e)})


if __name__ == "__main__":
    init()
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
