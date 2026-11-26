#!/usr/bin/env node
/* The demo's regression tests: the checker over every module, then each flow on each device, with a screenshot
   at each step, and, with --real, the real agents.
   node tests/run.js [--base URL] [--out DIR] [--devices desktop,pixel7,iphone14] [--flows a,b] [--real] */
const fs = require('fs'), path = require('path');
const {launch, Phone, open} = require('./lib.js');
const FLOWS = require('./flows.js');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : process.argv[i + 1]; };
const BASE = arg('base', 'http://localhost:8765/ui/'), OUT = arg('out', path.join(__dirname, 'out'));
const DEVS = arg('devices', 'desktop,pixel7,iphone14').split(','), ONLY = arg('flows', '');
const REALRUN = process.argv.includes('--real'), NOFLOWS = process.argv.includes('--no-flows');
const results = [];

/* the checker, over every module: the UI structure reads, covers the contract, and its UI style checks */
function checker() {
  const dir = path.join(__dirname, '..'), G = require(path.join(dir, 'ui.js')), pics = require(path.join(dir, 'pictures.js'));
  for (const f of fs.readdirSync(path.join(dir, 'modules')).filter(f => f.endsWith('.ui')).sort()) {
    const c = f.split('.')[0], sim = JSON.parse(fs.readFileSync(path.join(dir, 'sim-' + c + '.json'), 'utf8'));
    const spec = {acts: G.acts(sim), vocab: sim.vocab, env: sim.env, personal: G.personal(sim)};
    const P = G.resolve(spec, G.read(fs.readFileSync(path.join(dir, 'modules', f), 'utf8'))), R = G.check(spec, P.ui);
    const sf = path.join(dir, 'modules', f.replace(/\.ui$/, '.style'));
    const L = fs.existsSync(sf) ? G.checkLook(spec, P.ui, G.readLook(fs.readFileSync(sf, 'utf8')), pics) : {errors: [], warnings: []};
    const errs = [...(P.errors || []), ...L.errors].map(e => e.msg || String(e));
    /* a module made to show what an incomplete description looks like is let off completeness */
    const incompleteOk = /pages/.test(f);
    const ok = !errs.length && (R.complete || incompleteOk);
    results.push({flow: 'checker ' + f, device: 'node', ok, note: ok ? (L.warnings.length ? L.warnings.length + ' warnings' : '') : errs.concat(R.complete ? [] : ['incomplete']).join('; ')});
  }
}

async function runFlow(dev, name, flow, base, tag) {
  const {browser, context, engine} = await launch(dev);
  const dir = path.join(OUT, dev, tag || name); fs.mkdirSync(dir, {recursive: true});
  const t0 = Date.now();
  let ok = true, note = '';
  try {
    const {page, errors} = await open(context, base + flow.url);
    const A = new Phone(page, 0);
    await flow.run(A, n => A.shot(path.join(dir, n + '.png')), page);
    if (errors.length) { ok = false; note = 'page errors: ' + errors.join('; '); }
  } catch (e) {
    ok = false; note = String(e.message || e).split('\n')[0].slice(0, 400);
    try { const pg = context.pages()[0]; if (pg) await pg.screenshot({path: path.join(dir, 'FAILED.png')}); } catch (e2) {}
  }
  await browser.close();
  results.push({flow: tag || name, device: dev + ' [' + engine + ']', ok, note, secs: Math.round((Date.now() - t0) / 1000)});
}

/* the real agents: App, Friendship and Groups, on the server the page names */
const REALFLOWS = {
  'real-app': {url: '?c=app&real=1', async run(A, shot) { await A.has('Set up my identity', 20000); await A.tap('Set up my identity'); await A.has('✓', 20000); await shot('1-identity'); await A.tapSel('[data-help]'); await A.has('What you can do here'); await shot('2-help'); }},
  'real-friendship': {url: '?c=friendship&real=1', async run(A, shot) { await A.has('Set up my identity', 20000); await A.tap('Set up my identity'); await A.has('✓', 20000); await shot('1-identity'); }},
  'real-groups': {url: '?c=groups&real=1', async run(A, shot) { await A.has('Set up my identity', 20000); await A.tap('Set up my identity'); await A.has('New group', 20000); await A.tap('New group'); await A.tapSel('.sheet [data-namego]'); await A.has('No messages yet', 20000); await shot('1-then-it-group'); }}
};

(async () => {
  checker();
  for (const dev of DEVS) {
    if (!NOFLOWS) for (const [n, f] of Object.entries(FLOWS)) if (!ONLY || ONLY.split(',').includes(n)) await runFlow(dev, n, f, BASE);
    if (REALRUN) for (const [n, f] of Object.entries(REALFLOWS)) await runFlow(dev, n, f, BASE);
  }
  const w = Math.max(...results.map(r => r.flow.length));
  for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.flow.padEnd(w) + '  ' + r.device.padEnd(22) + (r.secs !== undefined ? String(r.secs).padStart(4) + 's ' : '      ') + (r.note || ''));
  const bad = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - bad} passed, ${bad} failed; screenshots in ${OUT}`);
  fs.mkdirSync(OUT, {recursive: true});
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({base: BASE, at: new Date().toISOString(), results}, null, 1));
  process.exit(bad ? 1 : 0);
})();
