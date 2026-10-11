// Checks that every stored solution in src/data.js passes the in-page checker, and that the answers the
// hints point to are allowed in each mode: the most basic answer (Normal and Restricted hints) never uses a tool
// tier above its plate's, and the Eco hint answer has the fewest operations on file.
// Run from the project root:  node test_checker.js
const fs = require('fs');
const Core = require('./src/core.js');
const PUZZLES = new Function(fs.readFileSync('./src/data.js', 'utf8') + 'return PUZZLES;')();
const NEW = { 2: 'sfp', 3: 'dwrq' }; // need codes each tier's Toolbox hint may name (see solver/build_data.py)
let bad = 0, total = 0;
const fail = (...a) => { bad++; if (bad <= 10) console.log('FAIL', ...a); };
PUZZLES.forEach((row, n) => {
  const d = String(n).padStart(4, '0');
  const [t, , basic, short, need] = row.split('|'), tier = +t;
  for (const sol of [basic, short].filter(Boolean)) {
    total++;
    const r = Core.check(sol, d);
    if (!r.ok) fail(d, sol, r.error);
  }
  if (Core.toolTier(basic) !== tier) fail(d, `most basic answer ${basic} uses tier ${Core.toolTier(basic)}, plate is tier ${tier}`);
  if (short && Core.opCount(short) >= Core.opCount(basic)) fail(d, `fewest answer ${short} isn't shorter than ${basic}`);
  if (tier > 1 && (!need || [...need.replace(/[,+]/g, '')].some((c) => !NEW[tier].includes(c)))) fail(d, `need "${need}" names tools outside tier ${tier}`);
});
console.log(bad ? `${bad} problems found` : `All ${total.toLocaleString('en')} stored solutions pass the checker; every hint answer stays within its mode's rules`);
process.exit(bad ? 1 : 0);
