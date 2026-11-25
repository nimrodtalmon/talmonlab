/* The UI compiler: a contract and an interface description in the UI language, to what an app reads.
 *
 *     node uic.js SIM.json NAME.ui > NAME.ui.json
 *
 * It refuses a description with errors, and one that is not complete (Proposition 1).  What it writes names
 * each act by its schema and each place by its number in the act's request, the I-th argument of the
 * request being the I-th of the act's places; the app finds the rest in the contract its platform declares.
 */
const fs = require('fs'), G = require('../ui.js');

function compile(sim, text) {
  const spec = {acts: G.acts(sim), vocab: sim.vocab, env: sim.env, personal: G.personal(sim)};
  const P = G.resolve(spec, G.read(text)), R = G.check(spec, P.ui);
  if (P.errors.length) throw new Error(P.errors.map(e => 'line ' + e.line + ': ' + e.msg).join('\n'));
  if (!R.complete) throw new Error('not complete: ' + Object.values(R.acts).filter(a => !a.covered).map(a => a.button).join(', '));
  /* the positions of each predicate's facts that hold persons, from the acts that add them */
  const personPos = {};
  for (const s of sim.schemas) {
    const ps = new Set(s.persons.concat(Object.keys(s.one)));
    for (const c of s.effects) if (c.p && !c.neg) c.args.slice(1).forEach((x, i) => { if (ps.has(x)) (personPos[c.p] = personPos[c.p] || new Set()).add(i + 1); });
  }
  const screens = {};
  for (const [name, C] of Object.entries(P.ui.containers)) {
    const comps = [];
    for (const c of C.components) {
      if (c.hidden) continue;
      if (c.kind === 'inbox') comps.push({kind: 'questions'});
      else if (c.kind === 'details') comps.push({kind: 'show', of: c.about, pos: c.pos, preds: c.shows});
      else if (c.kind === 'thread') comps.push({kind: 'thread', preds: c.shows});
      else if (c.kind === 'list') comps.push({kind: 'list', title: c.title, items: c.items.named ? {everyone: true} : c.items.pred ? {from: c.items.pred} : {facts: c.items.atoms, keep: c.items.within ? c.items.within.pos : null}, with: c.shows || [], opens: c.opens || null});
      else if (c.kind === 'action' && c.act) {
        const a = spec.acts.find(x => x.name === c.act), places = {};
        for (const [r, v] of Object.entries(c.bind)) {
          const k = a.names.indexOf(r) + 1;
          if (v === 'it') places[k] = {subject: null};
          else if (v.param) places[k] = {subject: v.pos};
          else if (v.field) places[k] = {typed: true};
          else if (v.select) { const l = C.components.find(x => x.id === v.select); places[k] = {from: l.items.named ? 'everyone' : l.items.pred}; }
        }
        comps.push({kind: 'action', schema: a.name, button: c.button, sentence: c.said || null, me: a.me, arity: a.names.length, places, covers: !!(R.comps[c.id] && R.comps[c.id].ok)});
      }
    }
    screens[name] = {about: C.aboutPred ? {fact: C.aboutPred} : C.aboutName ? {name: C.aboutName} : null, components: comps};
  }
  return {version: 1, start: P.ui.start, screens, personPos: Object.fromEntries(Object.entries(personPos).map(([p, s]) => [p, [...s].sort()])), complete: R.complete, visible: R.visible};
}
module.exports = compile;
if (require.main === module) process.stdout.write(JSON.stringify(compile(JSON.parse(fs.readFileSync(process.argv[2])), fs.readFileSync(process.argv[3], 'utf8')), null, 1) + '\n');
