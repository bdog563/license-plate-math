// Checks that every stored solution in src/data.js passes the in-page checker.
// Run from the project root:  node test_checker.js
const fs = require('fs');
const Core = require('./src/core.js');
const PUZZLES = new Function(fs.readFileSync('./src/data.js', 'utf8') + 'return PUZZLES;')();
let bad = 0, total = 0;
PUZZLES.forEach((row, n) => {
  const d = String(n).padStart(4, '0');
  for (const sol of row.split('|').slice(2, 4).filter(Boolean)) { // the basic and fewest-operations answers
    total++;
    const r = Core.check(sol, d);
    if (!r.ok) { bad++; if (bad <= 10) console.log('FAIL', d, sol, r.error); }
  }
});
console.log(bad ? `${bad} of ${total} stored solutions failed` : `All ${total.toLocaleString('en')} stored solutions pass the checker`);
process.exit(bad ? 1 : 0);
