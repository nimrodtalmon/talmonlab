/* The real app a contract runs as, for the demo's real agents (real.js): for each act, the places of its request
 * in the platform's order, and their types (a Speech a value its writer signs).
 *
 *     node realmap.js APP platform.vglp > real-NAME.json
 */
const fs = require('fs');
const [app, plat] = process.argv.slice(2);
const p = require('./platform.js').read(fs.readFileSync(plat, 'utf8'));
process.stdout.write(JSON.stringify({app, acts: Object.fromEntries(Object.entries(p.acts).map(([k, v]) => [k, v.names])), types: Object.fromEntries(Object.entries(p.acts).map(([k, v]) => [k, v.types]))}, null, 1) + '\n');
