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

  /* literal words of the schemas, {lit: w}, are the values w */
  const lits = x => Array.isArray(x) ? x.map(lits) : x && typeof x === 'object' ? ('lit' in x ? x.lit : Object.fromEntries(Object.entries(x).map(([k, v]) => [k, lits(v)]))) : x;
  /* a number or a constant an atom of a schema names, {f: num, a: [1]}, is that value */
  const PLAIN = ['then', 'body', 'and', 'or', 'over', 'not'];
  const plain = c => {
    if (Array.isArray(c)) return c.map(plain);
    if (!c || typeof c !== 'object') return c;
    const o = {...c};
    if (c.args) o.args = c.args.map(x => x && typeof x === 'object' && (x.f === 'num' || x.f === 'const') && x.a && x.a.length === 1 && typeof x.a[0] !== 'object' ? x.a[0] : x);
    for (const k of PLAIN) if (k in c) o[k] = plain(c[k]);
    return o;
  };
  function World(spec, persons) {
    spec.schemas = lits(spec.schemas).map(s => ({...s, effects: plain(s.effects), pre: plain(s.pre)}));
    this.spec = spec; this.persons = persons; this.cur = null; this.coin = 0;
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
    const h = this.setVar(c) >= 0 ? this.match(c, b).length > 0 : this.has(c.p, inst(c, b));
    return c.neg ? !h : h;
  };
  /* the bindings extending b under which the atom pattern a is in the state */
  /* a set: the variable S of type set stands for several atoms that differ only in that place, each a coin */
  World.prototype.setVar = function (a) {
    const s = this.cur;
    if (!s || !s.types) return -1;
    return a.args.findIndex(x => typeof x === 'string' && s.types[x] === 'set');
  };
  World.prototype.sizeOf = function (v, b) {
    const n = this.cur && this.cur.sizes ? this.cur.sizes[v] : undefined;
    if (typeof n === 'number') return n;
    if (n !== undefined && b[n] !== undefined) return +b[n];
    return undefined;
  };
  World.prototype.match = function (a, b) {
    const si = this.setVar(a);
    if (si >= 0) {
      const v = a.args[si], rest = {...a, args: a.args.map((x, i) => i === si ? '_' : x)};
      if (Array.isArray(b[v])) return b[v].every(id => this.has(a.p, inst({...a, args: a.args.map((x, i) => i === si ? '_' : x)}, b).map((x, i) => i === si ? id : x))) ? [b] : [];
      const groups = new Map();
      for (const m of this.match(rest, b)) {
        const k = JSON.stringify(Object.entries(m).filter(([x]) => !(x in b)));
        if (!groups.has(k)) groups.set(k, m);
      }
      const out = [];
      for (const m of groups.values()) {
        const ids = [...this.atoms.values()].filter(x => x.p === a.p && x.args.length === a.args.length && x.args.every((y, i) => i === si || same(y, inst(a, m)[i]) || inst(a, m)[i] === undefined)).map(x => x.args[si]);
        const k = this.sizeOf(v, m);
        if (k === undefined || ids.length < k) continue;
        out.push({...m, [v]: ids.slice(0, k)});
      }
      return out;
    }
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
    this.cur = s;
    if (!this.distinct(s, b)) return false;
    /* bind the sets, in order, from the preconditions that hold them */
    for (const c of s.pre) if (c.p && !c.neg && this.setVar(c) >= 0 && !Array.isArray(b[c.args[this.setVar(c)]])) {
      const ms = this.match(c, b); if (!ms.length) return false; Object.assign(b, ms[0]);
    }
    /* the guard first: a value it computes, as the side to move, is then checked against the facts */
    return this.guard(s.guard, b) && s.pre.every(c => this.holds(c, b)) && this.guard(s.guard, b);
  };
  /* the guard: comparisons of numbers, counts of atoms, sizes of sets; a number that no one gives is
     the one the comparison needs, as a witness: Votes in "at least Votes voted for it" is the count */
  World.prototype.num = function (t, b) {
    if (typeof t === 'number') return t;
    if (typeof t === 'string') return t in b ? +b[t] : (isNaN(+t) ? undefined : +t);
    if (!t || typeof t !== 'object') return undefined;
    const f = t.f, a = t.a || [];
    if (f === 'num' || f === 'const') return this.num(a[0], b);
    if (f === 'size') return Array.isArray(b[a[0]]) ? b[a[0]].length : undefined;
    if (f === 'cardinality') {
      const pat = lits(a[1]);
      const c = {p: pat.a[0].w || pat.a[0], args: pat.a[1].map(x => x && typeof x === 'object' && x.f && x.a && x.a.length === 1 && typeof x.a[0] === 'string' ? x.a[0] : x)};
      return new Set(this.match(c, {...b}).map(m => JSON.stringify(a[0].map(v => m[v])))).size;
    }
    const xs = a.map(x => this.num(x, b));
    if (xs.some(x => x === undefined)) return undefined;
    if (f === 'mul' || f === 'times') return xs[0] * xs[1];
    if (f === 'plus' || f === 'add') return xs[0] + xs[1];
    if (f === 'minus' || f === 'sub') return xs[0] - xs[1];
    return undefined;
  };
  /* a value: a number, or a value of another kind, as a position; a declared function is computed by the
     library of functions the page loads (GRASSROOTS_FNS), as the app compiler's library would */
  World.prototype.val = function (t, b) {
    if (t && typeof t === 'object' && t.f === 'fn') {
      const lib = typeof GRASSROOTS_FNS !== 'undefined' ? GRASSROOTS_FNS : {}, F = lib[t.a[0].w || t.a[0]], xs = (t.a[1] || []).map(x => this.val(x, b));
      return F && !xs.some(x => x === undefined) ? F(...xs) : undefined;
    }
    if (t && typeof t === 'object' && t.f === 'const' && typeof t.a[0] === 'string' && t.a[0] in b && typeof b[t.a[0]] === 'string' && isNaN(+b[t.a[0]])) return b[t.a[0]];
    return this.num(t, b);
  };
  const free = (t, b) => t && typeof t === 'object' && (t.f === 'num' || t.f === 'const') && typeof t.a[0] === 'string' && !(t.a[0] in b) && isNaN(+t.a[0]) ? t.a[0] : null;
  World.prototype.guard = function (g, b) {
    if (!g || (g.w === 'true')) return true;
    if (g.f === 'and') return g.a.every(x => this.guard(x, b));
    const [l, r] = g.a || [], ops = {eq: (x, y) => x === y, ge: (x, y) => x >= y, gt: (x, y) => x > y, le: (x, y) => x <= y, lt: (x, y) => x < y};
    if (!(g.f in ops)) return true;
    if (l && l.f === 'size') return true;
    const fl = free(l, b), fr = free(r, b);
    if (fr && !fl) { const v = this.val(l, b); if (v === undefined) return false; b[fr] = g.f === 'gt' ? v - 1 : g.f === 'lt' ? v + 1 : v; return true; }
    if (fl && !fr) { const v = this.val(r, b); if (v === undefined) return false; b[fl] = g.f === 'gt' ? v + 1 : g.f === 'lt' ? v - 1 : v; return true; }
    const x = this.val(l, b), y = this.val(r, b);
    return x !== undefined && y !== undefined && ops[g.f](x, y);
  };
  World.prototype.apply = function (s, b) {
    this.cur = s;
    const add = [], del = [];
    const eff = (c, m) => {
      if (c.forall) { for (const n of this.match(c.over, m)) c.then.forEach(t => eff(t, n)); return; }
      const si = this.setVar(c);
      if (si >= 0) {
        const v = c.args[si];
        if (!Array.isArray(m[v])) { const k = this.sizeOf(v, m) || 0; m[v] = Array.from({length: k}, () => ({coin: ++this.coin})); }
        for (const id of m[v]) eff({...c, args: c.args.map((x, i) => i === si ? '#' : x)}, {...m, '#': id});
        return;
      }
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
        this.cur = s;
        let bs = [{}];
        for (const c of s.pre) if (c.p && !c.neg) bs = bs.flatMap(b => this.match(c, b));
        for (const b of bs) if (this.allowed(s, b)) { this.apply(s, b); done = true; }
      }
      if (!done) return;
    }
  };
  /* why an act is not allowed: the first of its facts that does not hold as required, with its names bound */
  World.prototype.why = function (s, b) {
    this.cur = s;
    const bb = {...b};
    for (const c of s.pre) if (c.p && !c.neg && this.setVar(c) >= 0 && !Array.isArray(bb[c.args[this.setVar(c)]])) { const ms = this.match(c, bb); if (ms.length) Object.assign(bb, ms[0]); }
    /* the condition on the values first, as allowed checks it: it computes values the facts are then checked on */
    if (!this.guard(s.guard, bb)) {
      /* the first comparison that fails, by the function it calls, if it calls one */
      const leaf = g => g && g.f === 'and' ? g.a.map(leaf).find(x => x) : this.guard(g, {...bb}) ? null : g;
      const fn = JSON.stringify(leaf(s.guard) || {}).match(/"fn","a":\[\{"w":"(\w+)"/);
      return {guard: true, fn: fn ? fn[1] : null};
    }
    const c = s.pre.find(c => c.p && this.spec.vocab[c.p] && !this.holds(c, {...bb}));
    return c ? {p: c.p, args: c.args.map(x => x in bb ? bb[x] : x), neg: !!c.neg} : null;
  };
  World.prototype.propose = function (s, b) {
    const who = s.by[0];
    for (const c of s.pre) if (c.p === 'today' && !(c.args[1] in b)) b[c.args[1]] = this.today();
    if (!this.allowed(s, b)) { this.notes[b[who]].push({refused: s.button, why: this.why(s, b)}); return false; }
    const wait = s.by.slice(1).map(r => b[r]);
    if (!wait.length) { this.apply(s, b); this.settle(); this.prune(); this.notes[b[who]].push({done: s.button}); return true; }
    this.props.push({id: ++this.nid, s, b, wait: new Set(wait), from: b[who]});
    return true;
  };
  /* after an act, each proposer looks at its own part of the precondition again, and withdraws a proposal
     that its own state no longer allows: a check each agent makes on its own facts */
  World.prototype.prune = function () {
    this.props = this.props.filter(x => {
      this.cur = x.s;
      const who = x.s.by[0], own = x.s.pre.filter(c => c.p && c.args[0] === who && !(this.spec.env || []).includes(c.p));
      const ok = own.every(c => this.holds(c, {...x.b}));
      if (!ok) this.notes[x.from].push({withdrawn: x.s.button});
      return ok;
    });
  };
  World.prototype.answer = function (id, p, yes) {
    const x = this.props.find(y => y.id === id);
    if (!x) return;
    if (!yes) { this.props = this.props.filter(y => y !== x); this.notes[x.from].push({declined: x.s.button, by: p}); return; }
    x.wait.delete(p);
    if (x.wait.size) return;
    this.props = this.props.filter(y => y !== x);
    if (this.allowed(x.s, x.b)) { this.apply(x.s, x.b); this.settle(); this.prune(); this.notes[x.from].push({done: x.s.button}); } else this.notes[x.from].push({refused: x.s.button, why: this.why(x.s, x.b)});
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
