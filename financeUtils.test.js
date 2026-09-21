// financeUtils.test.js — no framework, just Node. Run: node financeUtils.test.js
// Tests use mathematical invariants that MUST hold, so they catch real bugs:
//   corr(x, x) = 1, corr(x, -x) = -1, beta(x, x) = 1, VaR >= 0, etc.

const fin = require('./financeUtils.js');

let passed = 0, failed = 0;
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
function check(name, cond) {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}`); }
}

// --- returns from prices ---------------------------------------------------
const rows = [
  { price_date: '2024-01-01', close_price: '100' },
  { price_date: '2024-01-02', close_price: '110' }, // +10%
  { price_date: '2024-01-03', close_price: '99'  }, // -10%
  { price_date: '2024-01-04', close_price: '105' }, // +6.0606%
];
const rmap = fin.dailyReturnsByDate(rows);
check('returns count = n-1', rmap.size === 3);
check('first return = +0.10', approx(rmap.get('2024-01-02'), 0.10));
check('second return = -0.10', approx(rmap.get('2024-01-03'), 99 / 110 - 1));

// --- stats invariants ------------------------------------------------------
const a = [0.01, -0.02, 0.03, -0.01, 0.02, -0.015, 0.005];
const negA = a.map((v) => -v);

check('mean matches manual', approx(fin.mean(a), a.reduce((s, v) => s + v, 0) / a.length));
check('sampleStdDev > 0', fin.sampleStdDev(a) > 0);
check('corr(x, x) = 1', approx(fin.correlation(a, a), 1, 1e-9));
check('corr(x, -x) = -1', approx(fin.correlation(a, negA), -1, 1e-9));
check('beta(x, x) = 1', approx(fin.beta(a, a), 1, 1e-9));

// --- VaR --------------------------------------------------------------------
check('historicalVaR >= 0', fin.historicalVaR(a, 0.95) >= 0);
check('parametricVaR >= 0', fin.parametricVaR(a, 0.95) >= 0);
check('99% VaR >= 95% VaR (parametric)', fin.parametricVaR(a, 0.99) >= fin.parametricVaR(a, 0.95));

// --- date alignment (the bug this whole refactor fixes) --------------------
const mapA = new Map([['d1', 0.1], ['d2', 0.2], ['d3', 0.3]]);
const mapB = new Map([['d2', 0.5], ['d3', 0.6], ['d4', 0.7]]); // d1 missing, d4 extra
const aligned = fin.alignReturns(mapA, mapB);
check('align keeps only shared dates', aligned.dates.join(',') === 'd2,d3');
check('align pairs A correctly', aligned.a.join(',') === '0.2,0.3');
check('align pairs B correctly', aligned.b.join(',') === '0.5,0.6');

// --- guards -----------------------------------------------------------------
let threw = false;
try { fin.sampleStdDev([0.01]); } catch { threw = true; }
check('sampleStdDev throws on <2 points', threw);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
