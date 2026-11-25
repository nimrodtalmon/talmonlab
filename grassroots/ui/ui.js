/* The UI language of the prototype: a reader, and the checker of the paper's two propositions.
 *
 *   screen NAME            the start screen is the first; another screen has one parameter: screen Person(p)
 *       inbox                    the pending questions of the person, with yes and no
 *       me: P, Q                 details: the facts of predicates P, Q about the person, or about the parameter (p: P, Q)
 *       list T: everyone|of P; shows P, Q; opens S     a list of every person named in the state, or of those in P's facts
 *       list T: atoms of P [with p.i]; ...               a list of the person's P facts; on a screen whose parameter is
 *                                                      a fact, `with` keeps those that name its argument at position i
 *       BUTTON: Role = SOURCE, ...                     an action for the act of that button; SOURCE is the parameter,
 *                                                      field (an open field), or pick everyone | pick of P
 */
(function (G) {
  function read(text) {
    const ui = {name: '', start: null, containers: {}}, lines = [], errors = [];
    let scr = null, n = 0, picks = 0;
    const err = (i, m) => errors.push({line: i, msg: m});
    for (const raw of text.split('\n')) {
      n++;
      const t = raw.replace(/#.*$/, '').trimEnd(), ind = t.length - t.trimStart().length, s = t.trim();
      const L = {n, raw, kind: 'blank'};
      lines.push(L);
      if (!s) { if (raw.trim().startsWith('#')) L.kind = 'comment'; continue; }
      let m;
      if (ind === 0) {
        if (!(m = s.match(/^screen\s+([A-Za-z][\w-]*)\s*(?:\(\s*([a-z]\w*)\s*\))?$/))) { err(n, 'expected: screen NAME or screen NAME(p)'); continue; }
        scr = m[1];
        if (ui.containers[scr]) { err(n, 'screen ' + scr + ' twice'); continue; }
        ui.containers[scr] = {params: m[2] ? [m[2]] : [], components: [], line: n};
        if (!ui.start) { ui.start = scr; if (m[2]) err(n, 'the start screen has no parameter'); }
        else if (!m[2]) err(n, 'a screen other than the start has one parameter');
        Object.assign(L, {kind: 'screen', screen: scr});
        continue;
      }
      if (!scr) { err(n, 'a line before the first screen'); continue; }
      const C = ui.containers[scr], id = 'l' + n, base = {id, line: n};
      if (s === 'inbox') { C.components.push({...base, zone: 'top', kind: 'inbox'}); Object.assign(L, {kind: 'comp', screen: scr, id}); continue; }
      if ((m = s.match(/^list\s+([^:]+):\s*(everyone|of\s+\w+|atoms\s+of\s+\w+(?:\s+with\s+[a-z]\w*\.\d)?)\s*((?:;\s*(?:shows\s+[\w,\s]+|opens\s+[\w-]+)\s*)*)$/))) {
        const w = m[2].match(/^atoms\s+of\s+(\w+)(?:\s+with\s+([a-z]\w*)\.(\d))?$/);
        const c = {...base, zone: 'middle', kind: 'list', title: m[1].trim(), items: m[2] === 'everyone' ? {named: true} : w ? {atoms: w[1]} : {pred: m[2].replace(/^of\s+/, '')}};
        if (w && w[2]) { if (!C.params.includes(w[2])) { err(n, w[2] + ' is not the parameter of ' + scr); continue; } c.items.within = {param: w[2], pos: +w[3]}; }
        for (const part of m[3].split(';').map(x => x.trim()).filter(Boolean)) {
          if (part.startsWith('shows')) c.shows = part.slice(5).split(',').map(x => x.trim()).filter(Boolean);
          else c.opens = part.slice(5).trim();
        }
        C.components.push(c); Object.assign(L, {kind: 'comp', screen: scr, id}); continue;
      }
      if ((m = s.match(/^thread:\s*([\w,\s]+)$/))) {
        C.components.push({...base, zone: 'middle', kind: 'thread', shows: m[1].split(',').map(x => x.trim()).filter(Boolean)});
        Object.assign(L, {kind: 'comp', screen: scr, id}); continue;
      }
      if ((m = s.match(/^(me|[a-z]\w*)(?:\.(\d))?:\s*([\w,\s]+)$/)) && (m[1] === 'me' || C.params.includes(m[1]))) {
        C.components.push({...base, zone: 'middle', kind: 'details', about: m[1], pos: m[2] ? +m[2] : null, shows: m[3].split(',').map(x => x.trim()).filter(Boolean)});
        Object.assign(L, {kind: 'comp', screen: scr, id}); continue;
      }
      if ((m = s.match(/^([A-Z][\w' -]*?)\s*(?::\s*(.*))?$/))) {
        const c = {...base, zone: 'bottom', kind: 'action', button: m[1].trim(), bind: {}};
        for (const part of (m[2] || '').split(',').map(x => x.trim()).filter(Boolean)) {
          const q = part.match(/^([A-Z]\w*)\s*=\s*(typed|pick everyone|pick of \w+|[a-z]\w*\.\d|[a-z]\w*)$/);
          if (!q) { err(n, 'expected: Role = field, pick everyone, pick of P, the parameter, or p.i'); continue; }
          let v = q[2];
          if (v === 'field') v = {field: true};
          else if (/\.\d$/.test(v)) { const [pp, i] = v.split('.'); if (!C.params.includes(pp)) { err(n, pp + ' is not the parameter of ' + scr); continue; } v = {param: pp, pos: +i}; }
          else if (v.startsWith('pick')) {
            const pid = 'pick' + (++picks);
            C.components.push({id: pid, zone: 'middle', line: n, kind: 'list', hidden: true, title: v, items: v === 'pick everyone' ? {named: true} : {pred: v.replace('pick of ', '')}});
            v = {select: pid};
          } else if (!C.params.includes(v)) { err(n, v + ' is not the parameter of ' + scr); continue; }
          c.bind[q[1]] = v;
        }
        C.components.push(c); Object.assign(L, {kind: 'comp', screen: scr, id}); continue;
      }
      err(n, 'not understood');
    }
    for (const [name, d] of Object.entries(ui.containers)) for (const c of d.components) if (c.opens) {
      const to = ui.containers[c.opens];
      if (!to) err(c.line, 'no screen ' + c.opens);
      else c.event = {navigate: c.opens, bind: {[to.params[0]]: 'item'}};
    }
    if (!ui.start) err(1, 'no screen');
    return {ui, lines, errors};
  }

  /* the act of an action: by its button, and, of several, the one whose roles the bindings name */
  function actOf(spec, c) {
    const as = spec.acts.filter(a => a.button === c.button);
    return as.find(a => Object.keys(c.bind).every(r => a.names.includes(r))) || as[0];
  }
  function resolve(spec, parsed) {
    for (const d of Object.values(parsed.ui.containers)) for (const c of d.components) if (c.kind === 'action') {
      const a = actOf(spec, c);
      if (!a) { parsed.errors.push({line: c.line, msg: 'the contract has no act of the button ' + c.button}); continue; }
      c.act = a.name;
      for (const r of Object.keys(c.bind)) if (!a.names.includes(r)) parsed.errors.push({line: c.line, msg: a.button + ' has no role ' + r + ' (its roles: ' + a.names.join(', ') + ')'});
    }
    return parsed;
  }

  /* the acts of a simulated contract, in the checker's terms: places, the proposer's place, and the
     proposer's local precondition, required and forbidden atoms over places (null: another value) */
  function acts(sim) {
    return sim.schemas.filter(s => !s.auto).map(s => {
      const env = new Set();
      for (const c of s.pre) if (c.p === 'today') env.add(c.args[1]);
      const sets = new Set(Object.keys(s.types || {}).filter(x => s.types[x] === 'set'));
      const derived = new Set(s.derived || []);
      const names = [...new Set(s.persons.concat(Object.keys(s.one), s.values))].filter(x => !env.has(x) && !sets.has(x) && !derived.has(x));
      const me = s.by[0], loc = (c) => [c.p, c.args.slice(1).map(x => names.includes(x) ? names.indexOf(x) + 1 : null)];
      const mine = s.pre.filter(c => c.p && c.args[0] === me && !sim.env.includes(c.p));
      return {name: s.name, button: s.button, names, me: names.indexOf(me) + 1, args: names, roles: s.persons.map(x => names.indexOf(x) + 1), people: s.persons.concat(Object.keys(s.one)).map(x => names.indexOf(x) + 1),
        values: s.values.filter(x => !env.has(x) && !s.persons.includes(x) && !sets.has(x) && !derived.has(x)), types: s.types || {}, field: s.field, sentence: s.sentence, questions: s.questions,
        req: mine.filter(c => !c.neg).map(loc), forb: mine.filter(c => c.neg).map(loc)};
    });
  }
  const placeOf = (a, r) => a.names.indexOf(r) + 1;
  function anchors(a) {
    const out = {};
    for (const [p, ks] of a.req) for (const k of ks) if (k !== null) (out[k] = out[k] || new Set()).add(p);
    return out;
  }
  const itemKinds = l => l.items.named ? ['named'] : l.items.atoms ? ['atom:' + l.items.atoms] : ['pred:' + l.items.pred];
  /* the ways into a screen: each a path of lists from the start screen, to a depth of four; a list `with`
     its screen's parameter keeps, of its facts, those that name the value the path came with */
  function paths(ui) {
    const out = {[ui.start]: [null]}, todo = [[ui.start, null, 0]];
    while (todo.length) {
      const [c, d, depth] = todo.shift();
      if (depth >= 4) continue;
      for (const x of ui.containers[c].components) if (x.event) {
        const nd = {kind: itemKinds(x)[0], list: x.id, via: x.items.within ? {desc: d, pos: x.items.within.pos} : null};
        const to = x.event.navigate, key = JSON.stringify(nd);
        out[to] = out[to] || [];
        if (out[to].some(y => JSON.stringify(y) === key)) continue;
        out[to].push(nd); todo.push([to, nd, depth + 1]);
      }
    }
    return out;
  }
  function kindsOf(v, d, comps) {
    if (v === 'me') return ['me'];
    if (typeof v === 'string') return d ? [d.kind.startsWith('atom:') ? 'whole:' + d.kind : d.kind] : [];
    if (v.param) return d && d.kind.startsWith('atom:') ? ['pos:' + d.kind.slice(5) + ':' + v.pos] : ['bad'];
    if (v.select) return itemKinds(comps.find(x => x.id === v.select));
    return ['any'];
  }
  function reaches(kinds, k, anc, roles) {
    if (!kinds.length) return false;
    if (kinds.includes('any')) return true;
    const need = anc[k] || new Set();
    return kinds.every(kd => (kd === 'named' && need.size > 0 && (!roles || roles.includes(k))) || (kd.startsWith('pred:') && need.has(kd.slice(5))) || kd.startsWith('pos:'));
  }
  /* a path through lists `with` a parameter reaches a fact only if the act also requires the facts the
     earlier lists were made of: one of each, naming the value the next list keeps */
  function chainOK(a, d, req) {
    for (; d && d.via; ) {
      const up = d.via.desc;
      if (!up) return false;
      if (up.kind === 'named') return d.via.pos === null;
      if (!up.kind.startsWith('atom:')) return false;
      const q = up.kind.slice(5), r = a.req.find(([p, pl]) => p === q && (d.via.pos === null ? pl.some(k => k !== null && req[1].includes(k)) : pl[d.via.pos - 1] !== null && req[1].includes(pl[d.via.pos - 1])));
      if (!r) return false;
      d = up; req = r;
    }
    return true;
  }
  function check(spec, ui) {
    const ways = paths(ui), reach = new Set(Object.keys(ways)), acts = {}, comps = {};
    for (const a of spec.acts) acts[a.name] = {button: a.button, covered: false};
    for (const c of reach) for (const x of ui.containers[c].components) if (x.kind === 'action' && x.act) {
      const a = spec.acts.find(y => y.name === x.act), anc = anchors(a), bind = {[a.me]: 'me'};
      for (const [r, v] of Object.entries(x.bind)) bind[placeOf(a, r)] = v;
      const ps = ui.containers[c].params;
      /* the action covers its act if, on one way into its screen, every place is reached */
      let best = null;
      for (const d of ways[c]) {
        const why = [];
        for (let k = 1; k <= a.args.length; k++) {
          if (k === a.me) continue;
          const r = a.names[k - 1];
          if (!(k in bind)) why.push(r + ' gets no value');
          else if (!reaches(kindsOf(bind[k], d, ui.containers[c].components), k, anc, a.roles)) why.push(r + ' may be someone this source does not reach');
        }
        /* places filled from the parameter's atom: all of them the positions of one required atom of its predicate */
        const fromAtom = Object.entries(x.bind).filter(([, v]) => v && v.param);
        if (fromAtom.length) {
          const ks = kindsOf(fromAtom[0][1], d, []), pred = ks.length === 1 && ks[0].startsWith('pos:') ? ks[0].split(':')[1] : null;
          const fit = pred && a.req.find(([p, pl]) => p === pred && fromAtom.every(([r, v]) => pl[v.pos - 1] === placeOf(a, r)));
          if (!fit) why.push('the places taken from the parameter are not the positions of one required ' + (pred || 'atom') + ' fact');
          else if (!chainOK(a, d, fit)) why.push('the act does not require the facts of the lists that lead to this screen');
        } else if (d && d.via) why.push('the act does not require the facts of the lists that lead to this screen');
        if (ps.length && !Object.values(x.bind).some(v => ps.includes(v) || (v && ps.includes(v.param)))) why.push('this screen opens only from a list, and the action does not use its parameter');
        if (!best || why.length < best.length) best = why;
        if (!why.length) break;
      }
      comps[x.id] = {ok: !best.length, why: best};
      if (!best.length) acts[a.name].covered = true;
    }
    for (const d of Object.values(ui.containers)) for (const x of d.components) if (x.kind === 'action' && !(x.id in comps)) comps[x.id] = {ok: false, why: ['no list opens this screen']};
    const preds = new Set(Object.keys(spec.vocab).filter(p => !(spec.env || []).includes(p)));
    for (const a of spec.acts) for (const [p] of a.req.concat(a.forb)) preds.add(p);
    /* Proposition 2: a predicate with arguments is shown by a list of its atoms on the start screen or, if
       its atoms each name a person, next to everyone there or by the details of a person whose screen that
       list opens; one without arguments, by the person's details on the start screen */
    const st = ui.containers[ui.start].components, shown = new Set(), arity = p => spec.vocab[p] ? spec.vocab[p].vars.length - 1 : 0;
    const everyone = st.filter(x => x.kind === 'list' && !x.hidden && x.items.named);
    const opened = new Set(everyone.filter(x => x.event).map(x => x.event.navigate));
    for (const p of preds) {
      const ok = arity(p) === 0 ? st.some(x => x.kind === 'details' && x.about === 'me' && x.shows.includes(p))
        : st.some(x => x.kind === 'list' && !x.hidden && x.items.atoms === p) || (spec.personal || []).includes(p) && (everyone.some(x => (x.shows || []).includes(p)) || [...opened].some(c => ui.containers[c].components.some(x => (x.kind === 'thread' || x.kind === 'details' && x.about !== 'me' && !x.pos) && x.shows.includes(p))));
      if (ok) shown.add(p);
    }
    const inbox = [...reach].some(c => ui.containers[c].components.some(x => x.kind === 'inbox'));
    const hidden = [...preds].filter(p => !shown.has(p)).sort(), somewhere = new Set();
    for (const c of reach) for (const x of ui.containers[c].components) {
      (x.shows || []).forEach(p => somewhere.add(p));
      if (x.kind === 'list' && !x.hidden && x.items.atoms) somewhere.add(x.items.atoms);
    }
    /* inner: shown, but only on screens reached through other facts; that each of them is found there
       depends on what else the person holds, which Proposition 2 does not check */
    return {acts, comps, hidden: hidden.filter(p => !somewhere.has(p)), inner: hidden.filter(p => somewhere.has(p)), inbox, complete: inbox && Object.values(acts).every(a => a.covered), visible: !hidden.length};
  }

  /* every state of one viewer among the persons, the allowed answers, and those the interface does not offer */
  function offered(spec, ui, st, me, persons) {
    const named = [...new Set(st.flatMap(([, xs]) => xs))].sort(), out = new Set(), seen = new Set(), todo = [[ui.start, {}]];
    while (todo.length) {
      const [c, env] = todo.pop(), key = c + JSON.stringify(env);
      if (seen.has(key)) continue;
      seen.add(key);
      const cs = ui.containers[c].components, items = {};
      for (const x of cs) if (x.kind === 'list') items[x.id] = x.items.named ? named : [...new Set(st.filter(([p]) => p === x.items.pred).flatMap(([, xs]) => xs))];
      for (const x of cs) {
        if (x.event) for (const it of items[x.id]) todo.push([x.event.navigate, Object.fromEntries(Object.entries(x.event.bind).map(([k, v]) => [k, v === 'item' ? it : env[v]]))]);
        if (x.kind !== 'action' || !x.act) continue;
        const a = spec.acts.find(y => y.name === x.act), ch = {[a.me]: [me]};
        for (const [r, v] of Object.entries(x.bind)) ch[placeOf(a, r)] = typeof v === 'string' ? [env[v]] : v.select ? items[v.select] : persons.filter(p => p !== me);
        let vals = [[]];
        for (let k = 1; k <= a.args.length; k++) { if (!ch[k]) { vals = []; break; } vals = vals.flatMap(v => ch[k].map(y => v.concat([y]))); }
        for (const v of vals) out.add(a.name + '(' + v.join(',') + ')');
      }
    }
    return out;
  }
  function brute(spec, ui, persons) {
    const me = persons[0], rest = persons.slice(1), preds = {};
    for (const a of spec.acts) for (const [p, ks] of a.req.concat(a.forb)) preds[p] = ks.length;
    const atoms = [];
    for (const [p, n] of Object.entries(preds).sort()) { if (n === 0) atoms.push([p, []]); else for (const x of rest) atoms.push([p, [x]]); }
    let states = 0, answers = 0, missed = 0;
    const examples = [], has = (st, p, xs) => st.some(([q, ys]) => q === p && ys.join() === xs.join());
    for (let bits = 0; bits < (1 << atoms.length); bits++) {
      const st = atoms.filter((_, i) => bits >> i & 1);
      states++;
      const offer = offered(spec, ui, st, me, persons);
      for (const a of spec.acts) {
        const ps = []; for (let k = 1; k <= a.args.length; k++) if (k !== a.me) ps.push(k);
        let vals = [[]]; for (const _ of ps) vals = vals.flatMap(v => rest.filter(x => !v.includes(x)).map(x => v.concat([x])));
        for (const vs of vals) {
          const v = {[a.me]: me}; ps.forEach((k, j) => v[k] = vs[j]);
          const ok = a.req.every(([p, ks]) => has(st, p, ks.map(k => v[k]))) && !a.forb.some(([p, ks]) => has(st, p, ks.map(k => v[k])));
          if (!ok) continue;
          answers++;
          const b = a.name + '(' + a.args.map((_, k) => v[k + 1]).join(',') + ')';
          if (!offer.has(b)) { missed++; if (examples.length < 3) examples.push({state: st.map(([p, xs]) => xs.length ? p + '(' + xs + ')' : p), answer: b}); }
        }
      }
    }
    return {states, answers, missed, examples};
  }

  /* the predicates whose atoms each name a person: every atom an act adds names one */
  function personal(sim) {
    const out = {};
    for (const s of sim.schemas) {
      const ps = new Set(s.persons.concat(Object.keys(s.one)));
      for (const c of s.effects) if (c.p && !c.neg && !(sim.env || []).includes(c.p)) out[c.p] = (out[c.p] ?? true) && c.args.slice(1).some(x => ps.has(x));
    }
    return Object.keys(out).filter(p => out[p]);
  }
  const api = {read, resolve, check, brute, actOf, acts, personal};
  if (typeof module !== 'undefined') module.exports = api; else G.GUI = api;
})(this);
