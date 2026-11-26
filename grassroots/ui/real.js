/* The demo's screens on real GLP agents: a world on the real-agents server (servers/uiagents of the GLP fork),
 * each person the miniapp agent of the contract's real app, drawn by the same renderer as the simulation.
 *
 * It answers the renderer as the simulation does (engine.js): view(p), propose(s, b), answer(id, p, yes), the
 * notes, and the contract's conditions (guard, why), which it checks on a copy of the agents' facts, the
 * simulation of the same contract.  A request is the act's places in the platform's order (real-NAME.json).
 */
(function (G) {
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const key = a => JSON.stringify([a.p, a.args]);
  function RealWorld(spec, persons, map, base, onchange) {
    this.spec = spec; this.persons = persons; this.map = map; this.base = base; this.onchange = onchange;
    this.sim = new G.Engine.World(spec, persons);
    this.notes = {}; persons.forEach(p => this.notes[p] = []);
    this.st = null; this.seqs = new Map(); this.seq = 0; this.out = {}; persons.forEach(p => this.out[p] = []);
    this.told = new Set(); this.busy = Promise.resolve(); this.error = null;
    /* where a text sits in a fact: the open value of each act whose field is a text, in the facts it adds, and
       who wrote it, the act's proposer */
    this.texts = {};
    for (const s of spec.schemas) if (s.field === 'text' && s.values && s.values.length)
      for (const e of s.effects || []) if (e.p && !e.neg) {
        const i = e.args.indexOf(s.values[0]), by = e.args.indexOf(s.by[0]);
        if (i > 0) this.texts[e.p] = {i: i - 1, by: by > 0 ? by - 1 : -1};
      }
  }
  Object.defineProperty(RealWorld.prototype, 'cur', {get() { return this.sim.cur; }, set(v) { this.sim.cur = v; }});
  RealWorld.prototype.guard = function (g, b) { return this.sim.guard(g, b); };
  RealWorld.prototype.why = function (s, b) { return this.sim.why(s, b); };
  RealWorld.prototype.call = function (path, body) {
    const run = async () => {
      const r = await fetch(this.base + path, {method: 'POST', body: body === undefined ? undefined : JSON.stringify(body)});
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      if (j.id) this.id = j.id;
      this.take(j.state);
    };
    this.busy = this.busy.then(run).catch(e => { this.error = String(e.message || e); }).then(() => this.onchange && this.onchange());
    return this.busy;
  };
  RealWorld.prototype.start = async function (app, scripted) {
    await this.call('/new?app=' + app);
    for (const p of scripted) await this.call(`/propose?id=${this.id}&p=${p}`, {f: 'establish', args: [{a: p}]});
  };
  /* a real value as the simulation writes it: a name as itself, a speech act, speech(utterance(S), P), as the
     text {t: S, by: P} */
  const val = j => j == null ? null : 'a' in j ? j.a : 'n' in j ? j.n : 'l' in j ? j.l.map(val)
    : j.f === 'speech' && j.args.length === 2 && j.args[0].f === 'utterance' ? {t: val(j.args[0].args[0]), by: val(j.args[1])}
    : j.f ? {f: j.f, args: j.args.map(val)} : null;
  /* and back: a text is the speech act its writer signs, as the app's text field forms it */
  const real = x => x && typeof x === 'object' && 't' in x ? {f: 'speech', args: [{f: 'utterance', args: [{a: String(x.t)}]}, {a: String(x.by)}]}
    : typeof x === 'number' ? {n: x} : Array.isArray(x) ? {l: x.map(real)} : {a: String(x)};
  const fa = j => j.f ? [j.f, j.args] : [j.a, []];
  RealWorld.prototype.atom = function (holder, j) {
    const [p, as] = fa(j), args = as.map(val), t = this.texts[p];
    const k = holder + key({p, args});
    if (!this.seqs.has(k)) this.seqs.set(k, ++this.seq);
    const n = this.seqs.get(k);
    if (t && t.i < args.length && typeof args[t.i] === 'string') args[t.i] = {t: args[t.i], by: t.by >= 0 ? args[t.by] : holder};
    if (t && t.i < args.length && args[t.i] && typeof args[t.i] === 'object' && 't' in args[t.i]) args[t.i] = {...args[t.i], n};
    return {p, args, seq: n};
  };
  /* a request as the simulation's schema and binding */
  RealWorld.prototype.bind = function (j, from) {
    const [name, as] = fa(j), s = this.spec.schemas.find(x => x.name === name), names = this.map.acts[name] || [];
    if (!s) return null;
    const b = {};
    names.forEach((n, i) => { b[n] = val(as[i]); });
    return {s, b};
  };
  RealWorld.prototype.take = function (st) {
    this.st = st;
    const all = new Map();
    for (const p of this.persons) for (const a of this.view(p).atoms) { const x = {p: a.p, args: [p, ...a.args], seq: a.seq}; all.set(key(x), x); }
    this.sim.atoms = all;
    /* the acts each person asked: done once no longer pending and not refused */
    for (const p of this.persons) {
      const v = st[p], notices = (v && v.notices) || [], pend = this.pendingOf(p).map(x => JSON.stringify(x.req));
      for (const n of notices) {
        const k = p + JSON.stringify(n);
        if (this.told.has(k)) continue;
        this.told.add(k);
        const part = n.args && n.args[0], why = n.args && n.args[2];
        const x = this.out[p].find(o => part && fa(part)[0] === o.s.name);
        if (!x) continue;
        this.out[p] = this.out[p].filter(o => o !== x);
        if (why && why.a === 'declined') this.notes[p].push({declined: x.s.button, by: val(n.args[1])});
        else this.notes[p].push({refused: x.s.button, why: this.sim.why(x.s, x.b)});
      }
      for (const o of [...this.out[p]]) {
        if (pend.includes(JSON.stringify(o.req))) { o.seen = true; continue; }
        if (!o.seen && !o.answered) continue;
        this.out[p] = this.out[p].filter(y => y !== o);
        this.notes[p].push({done: o.s.button});
      }
    }
  };
  RealWorld.prototype.pendingOf = function (p) {
    const v = this.st && this.st[p] && this.st[p].view;
    /* each with the persons it waits on: the others who must agree to it */
    return v ? v.args[3].l.map(r => { const x = this.bind(r, p) || {s: {button: fa(r)[0], by: []}, b: {}}; return {req: r, ...x, from: p, wait: new Set(x.s.by.slice(1).map(n => x.b[n]).filter(y => y && y !== p))}; }) : [];
  };
  RealWorld.prototype.view = function (p) {
    const v = this.st && this.st[p];
    if (!v || !v.view) return {atoms: [], asks: [], pending: [], notes: this.notes[p]};
    return {
      atoms: v.view.args[1].l.map(j => this.atom(p, j)),
      /* a question's head names who asks, first, and the request, the one of its terms that is an act of the app
         (hello(From, Request), attempt(From, I, J, Request, Sig)) */
      asks: (v.questions || []).map(q => {
        const h = q.view.args[0], from = val(h.args[0]), r = (h.args || []).find(t => t.f && this.map.acts[t.f]), x = r && this.bind(r, from);
        return x && {id: q.id, ...x, from};
      }).filter(x => x),
      pending: this.pendingOf(p),
      notes: this.notes[p]
    };
  };
  RealWorld.prototype.propose = function (s, b) {
    const who = b[s.by[0]], names = this.map.acts[s.name];
    if (!names) { this.notes[who].push({refused: s.button, why: null}); return false; }
    const req = {f: s.name, args: names.map(n => real(b[n]))};
    const o = {s, b, req: {f: s.name, args: req.args}, seen: false};
    this.out[who].push(o);
    /* an act no one else must agree to is done when the agent has taken it */
    this.call(`/propose?id=${this.id}&p=${who}`, req).then(() => { o.answered = true; this.take(this.st); this.onchange && this.onchange(); });
    return true;
  };
  RealWorld.prototype.answer = function (id, p, yes) {
    this.call(`/answer?id=${this.id}&p=${p}&q=${id}&yes=${yes ? 1 : 0}`);
  };
  G.Real = {RealWorld};
})(this);
