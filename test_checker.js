// Checks that every stored solution in src/data.js passes the in-page checker, and that the answers the
// hints point to are allowed in each mode: the most basic answer (Normal and Restricted hints) never uses a tool
// tier above its plate's, and the Eco hint answer has the fewest operations on file. Each plate's level fits its
// tier. For Random's tool switches, every combination of switches off gets an answer that avoids them on every
// plate that can be done without them.
// Run from the project root:  node test_checker.js
const fs = require('fs');
const Core = require('./src/core.js');
const PUZZLES = new Function(fs.readFileSync('./src/data.js', 'utf8') + 'return PUZZLES;')();
const NEW = { 2: 'sfp', 3: 'dwrq' }; // need codes each tier's Toolbox hint may name (see solver/build_data.py)
const LEVEL_TIERS = { e: [1], m: [1, 2], h: [2], x: [3] }; // which tool tiers each stored level can have
const SWITCHES = ['s', 'f', 'p', 'd', 'w', 'r'];
const COMBOS = Array.from({ length: 64 }, (_, m) => new Set(SWITCHES.filter((c, i) => m & (1 << i))));
let bad = 0, total = 0, picks = 0;
const fail = (...a) => { bad++; if (bad <= 10) console.log('FAIL', ...a); };
PUZZLES.forEach((row, n) => {
  const d = String(n).padStart(4, '0');
  const [t, lv, basic, short, need, optField] = row.split('|'), tier = +t;
  if (!(LEVEL_TIERS[lv] || []).includes(tier)) fail(d, `level "${lv}" doesn't fit a tier ${tier} plate`);
  const options = Core.parseOptions(optField, basic);
  for (const sol of [basic, short, ...options.map((o) => o.sol).filter((x) => x !== basic)].filter(Boolean)) {
    total++;
    const r = Core.check(sol, d);
    if (!r.ok) fail(d, sol, r.error);
  }
  if (Core.toolTier(basic) !== tier) fail(d, `most basic answer ${basic} uses tier ${Core.toolTier(basic)}, plate is tier ${tier}`);
  if (short && Core.opCount(short) >= Core.opCount(basic)) fail(d, `fewest answer ${short} isn't shorter than ${basic}`);
  if (tier > 1 && (!need || [...need.replace(/[,+]/g, '')].some((c) => !NEW[tier].includes(c)))) fail(d, `need "${need}" names tools outside tier ${tier}`);
  if (tier > 1 && !options.length) fail(d, 'no switch options stored');
  for (const o of options) if ([...Core.toolCodes(o.sol)].some((c) => !o.codes.has(c))) fail(d, `option ${[...o.codes]} answer ${o.sol} uses other switches`);
  for (const off of COMBOS) { // whatever is switched off, the hint answer avoids it whenever the plate allows
    const fits = tier === 1 || options.some((o) => ![...o.codes].some((c) => off.has(c)));
    const a = Core.answerFor(basic, options, off);
    if (!fits) { if (a !== null) fail(d, `answer ${a} offered though no option avoids ${[...off]}`); continue; }
    picks++;
    if (a === null || [...Core.toolCodes(a)].some((c) => off.has(c))) fail(d, `with ${[...off]} off the answer ${a} isn't allowed`);
    else if (Core.toolTier(a) < tier) fail(d, `answer ${a} is below the plate's tier`);
  }
});
console.log(bad ? `${bad} problems found` : `All ${total.toLocaleString('en')} stored solutions pass the checker; every hint answer stays within its mode's rules, including ${picks.toLocaleString('en')} plate/switch combinations`);
process.exit(bad ? 1 : 0);
