/* A simulation of a grassroots contract from its schemas, as the Grassroots Contracts Calculus gives them.
 *
 * The state is a set of atoms; an atom is held by the person who is its first argument.  A schema is
 * done for a binding of its persons and values when its preconditions hold; its effects add and remove
 * atoms.  A schema that someone does is proposed by the first person who must agree to it, and done when
 * every other such person has said yes.  A schema that no one must agree to (by = []) is done by the
 * machine whenever it may be.  The current date is the environment's: today(x, e) holds for e today.
 */
(function (G) {
  const key = a => JSON.stringify([a.p, a.args]);
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);

  function World(spec, persons) {
    this.spec = spec; this.persons = persons;
    this.atoms = new Map(); this.seq = 0; this.props = []; this.notes = {}; this.day = 1; this.nid = 0;
    persons.forEach(p => this.notes[p] = []);
  }
  World.prototype.today = function () { return 'day ' + this.day; };
  World.prototype.has = function (p, args) {
    if (this.spec.reflexive.includes(p) && args.length === 2 && args[0] === args[1] && args[0] !== undefined) return true;
    if (p === 'today') return args[1] === undefined || args[1] === this.today();
    if (this.spec.env.includes(p)) return true;
    for (const a of this.atoms.values()) if (a.p === p && a.args.length === args.length && a.args.every((x, i) => args[i] === undefined || same(x, args[i]))) return true;
    return false;
  };
  /* the arguments of a pattern under a binding: undefined for a wildcard */
  const inst = (a, b) => a.args.map(x => x === '_' ? undefined : (x in b ? b[x] : x));
  World.prototype.holds = function (c, b) {
    if (c.or) return c.or.some(cs => cs.every(x => this.holds(x, b)));
    if (c.and) return c.and.every(x => this.holds(x, b));
    if (c.not) return !this.holds(c.not, b);
    if (c.exists) return this.solve(c.body, b).length > 0;
    if (c.forall) {
      for (const m of this.match(c.over, b)) if (!c.then.every(t => this.holds(t, m))) return false;
      return true;
    }
    const h = this.has(c.p, inst(c, b));
    return c.neg ? !h : h;
  };
  /* the bindings extending b under which the atom pattern a is in the state */
  World.prototype.match = function (a, b) {
    const out = [];
    if (a.p === 'today') {
      const m = {...b}, v = a.args[1];
      if (!(v in m)) m[v] = this.today(); else if (m[v] !== this.today()) return out;
      return [m];
    }
    const cands = [...this.atoms.values()].filter(x => x.p === a.p && x.args.length === a.args.length);
    if (this.spec.reflexive.includes(a.p)) for (const p of this.persons) cands.push({p: a.p, args: [p, p]});
    for (const x of cands) {
      const m = {...b};
      let ok = true;
      a.args.forEach((v, i) => {
        if (!ok || v === '_') return;
        if (v in m) ok = same(m[v], x.args[i]); else m[v] = x.args[i];
      });
      if (ok) out.push(m);
    }
    return out;
  };
  World.prototype.solve = function (cs, b) {
    let bs = [b];
    for (const c of cs) if (c.p && !c.neg) bs = bs.flatMap(x => this.match(c, x));
    return bs.filter(x => cs.every(c => this.holds(c, x)));
  };
  World.prototype.distinct = function (s, b) {
    const ps = s.persons.map(p => b[p]);
    return ps.every(p => this.persons.includes(p)) && new Set(ps).size === ps.length;
  };
  World.prototype.allowed = function (s, b) {
    return this.distinct(s, b) && s.pre.every(c => this.holds(c, b));
  };
  World.prototype.apply = function (s, b) {
    const add = [], del = [];
    const eff = (c, m) => {
      if (c.forall) { for (const n of this.match(c.over, m)) c.then.forEach(t => eff(t, n)); return; }
      const args = inst(c, m);
      if (c.neg) { for (const [k, a] of this.atoms) if (a.p === c.p && a.args.length === args.length && a.args.every((x, i) => args[i] === undefined || same(x, args[i]))) del.push(k); }
      else add.push({p: c.p, args});
    };
    s.effects.forEach(c => eff(c, b));
    del.forEach(k => this.atoms.delete(k));
    for (const a of add) { const k = key(a); if (!this.atoms.has(k)) this.atoms.set(k, {...a, seq: ++this.seq}); }
  };
  /* the machine's acts: every binding the positive preconditions give, to a fixpoint */
  World.prototype.settle = function () {
    for (let round = 0; round < 50; round++) {
      let done = false;
      for (const s of this.spec.schemas.filter(x => x.auto)) {
        let bs = [{}];
        for (const c of s.pre) if (c.p && !c.neg) bs = bs.flatMap(b => this.match(c, b));
        for (const b of bs) if (this.allowed(s, b)) { this.apply(s, b); done = true; }
      }
      if (!done) return;
    }
  };
  World.prototype.propose = function (s, b) {
    const who = s.by[0];
    for (const c of s.pre) if (c.p === 'today' && !(c.args[1] in b)) b[c.args[1]] = this.today();
    if (!this.allowed(s, b)) { this.notes[b[who]].push({refused: s.button}); return false; }
    const wait = s.by.slice(1).map(r => b[r]);
    if (!wait.length) { this.apply(s, b); this.settle(); return true; }
    this.props.push({id: ++this.nid, s, b, wait: new Set(wait), from: b[who]});
    return true;
  };
  World.prototype.answer = function (id, p, yes) {
    const x = this.props.find(y => y.id === id);
    if (!x) return;
    if (!yes) { this.props = this.props.filter(y => y !== x); this.notes[x.from].push({declined: x.s.button, by: p}); return; }
    x.wait.delete(p);
    if (x.wait.size) return;
    this.props = this.props.filter(y => y !== x);
    if (this.allowed(x.s, x.b)) { this.apply(x.s, x.b); this.settle(); } else this.notes[x.from].push({refused: x.s.button});
  };
  /* what a person sees: the atoms they hold, without themselves; the questions to them; what they wait for */
  World.prototype.view = function (p) {
    const atoms = [...this.atoms.values()].filter(a => a.args[0] === p).map(a => ({p: a.p, args: a.args.slice(1), seq: a.seq}));
    return {
      atoms,
      asks: this.props.filter(x => x.wait.has(p)).map(x => ({id: x.id, s: x.s, b: x.b})),
      pending: this.props.filter(x => x.from === p),
      notes: this.notes[p]
    };
  };
  const api = {World};
  if (typeof module !== 'undefined') module.exports = api; else G.Engine = api;
})(this);
