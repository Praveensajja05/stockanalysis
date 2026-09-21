// financeUtils.js
// Pure, reusable finance/stats helpers for the risk engine.
// No database, no req/res in here — just math. Every route imports from this
// file instead of copy-pasting the same formulas five times, and because these
// are pure functions they are trivially unit-testable (see stage 1 tests).

// ---------------------------------------------------------------------------
// basic stats
// ---------------------------------------------------------------------------

function mean(values) {
  if (values.length === 0) throw new Error('mean: empty array');
  const sum = values.reduce((acc, v) => acc + v, 0);
  return sum / values.length;
}

// SAMPLE standard deviation — divides by (n - 1), "Bessel's correction".
// INTERVIEW: we use n-1, not n, because our daily returns are a *sample* of all
// possible days, not the entire population. Dividing by n systematically
// underestimates the true spread. For n≈99 the numeric difference is small,
// but knowing WHICH you used and WHY is exactly what gets probed.
function sampleStdDev(values) {
  if (values.length < 2) throw new Error('sampleStdDev: need at least 2 points');
  const m = mean(values);
  const sumSq = values.reduce((acc, v) => acc + (v - m) ** 2, 0);
  return Math.sqrt(sumSq / (values.length - 1));
}

// ---------------------------------------------------------------------------
// returns
// ---------------------------------------------------------------------------

// Build a Map of date -> daily simple return from price rows.
// rows: [{ price_date, close_price }, ...] sorted ascending by date.
// Keying by DATE (not array index) is what lets us align two different stocks
// safely. INTERVIEW: pairing two stocks by array position silently breaks the
// moment one is missing a trading day (halt, holiday mismatch, data gap) — you
// get wrong-but-plausible numbers, the worst kind of bug in finance.
function dailyReturnsByDate(rows) {
  const map = new Map();
  for (let i = 1; i < rows.length; i++) {
    const prev = parseFloat(rows[i - 1].close_price);
    const curr = parseFloat(rows[i].close_price);
    const raw = rows[i].price_date;
    const date = raw instanceof Date
      ? raw.toISOString().slice(0, 10)
      : String(raw).slice(0, 10);
    map.set(date, (curr - prev) / prev);
  }
  return map;
}

// Given two date->return maps, return two arrays containing ONLY the dates both
// stocks have, in shared chronological order. This is the fix for the
// alignment bug — correlation/beta/portfolio all go through here.
function alignReturns(mapA, mapB) {
  const sharedDates = [...mapA.keys()].filter((d) => mapB.has(d)).sort();
  const a = sharedDates.map((d) => mapA.get(d));
  const b = sharedDates.map((d) => mapB.get(d));
  return { dates: sharedDates, a, b };
}

// Convenience: plain array of return values (no dates) from price rows.
function returnsArray(rows) {
  return [...dailyReturnsByDate(rows).values()];
}

// ---------------------------------------------------------------------------
// covariance / correlation / beta
// ---------------------------------------------------------------------------

// Sample covariance of two EQUAL-LENGTH, date-aligned return arrays.
function covariance(a, b) {
  if (a.length !== b.length) throw new Error('covariance: length mismatch');
  if (a.length < 2) throw new Error('covariance: need at least 2 points');
  const ma = mean(a);
  const mb = mean(b);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - ma) * (b[i] - mb);
  return sum / (a.length - 1);
}

function correlation(a, b) {
  return covariance(a, b) / (sampleStdDev(a) * sampleStdDev(b));
}

// beta of an asset vs a benchmark = cov(asset, benchmark) / variance(benchmark)
function beta(assetReturns, benchmarkReturns) {
  const varBench = sampleStdDev(benchmarkReturns) ** 2;
  return covariance(assetReturns, benchmarkReturns) / varBench;
}

// ---------------------------------------------------------------------------
// annualization + Sharpe
// ---------------------------------------------------------------------------

const TRADING_DAYS = 252;
const annualizeReturn = (dailyMean) => dailyMean * TRADING_DAYS;
const annualizeVol = (dailyStdDev) => dailyStdDev * Math.sqrt(TRADING_DAYS);

// INTERVIEW: the risk-free rate must match the assets' market/currency.
// AAPL/MSFT/SPY are US instruments, so use a US T-bill rate (~4.5%), NOT
// India's ~7%. Mixing them is a small number with a big "did they think about
// it" signal. Default is a parameter so it's explicit, not buried.
function sharpeRatio(returns, riskFreeAnnual = 0.045) {
  const annReturn = annualizeReturn(mean(returns));
  const annVol = annualizeVol(sampleStdDev(returns));
  return (annReturn - riskFreeAnnual) / annVol;
}

// ---------------------------------------------------------------------------
// Value at Risk
// Both functions return a POSITIVE number = the loss threshold as a FRACTION
// of value. Multiply by portfolio market value for a dollar figure.
// ---------------------------------------------------------------------------

// Historical VaR: empirical percentile of actual returns. No distribution
// assumed — just "how bad were the worst (1-confidence)% of real days".
function historicalVaR(returns, confidence = 0.95) {
  if (returns.length < 2) throw new Error('historicalVaR: not enough data');
  const sorted = [...returns].sort((x, y) => x - y);
  const idx = Math.floor((1 - confidence) * sorted.length);
  const worst = sorted[idx];
  return Math.max(0, -worst); // express as a positive loss magnitude
}

// Parametric (variance-covariance) VaR: assumes returns are normally
// distributed. z = 1.645 for 95%, 2.33 for 99%.
// INTERVIEW: real returns have fat tails, so parametric typically UNDERSTATES
// extreme risk relative to historical. Being able to explain why the two
// methods disagree is the single best talking point in the whole project.
function parametricVaR(returns, confidence = 0.95) {
  const z = confidence === 0.99 ? 2.33 : 1.645;
  const m = mean(returns);
  const sd = sampleStdDev(returns);
  return Math.max(0, -(m - z * sd));
}

module.exports = {
  mean,
  sampleStdDev,
  dailyReturnsByDate,
  alignReturns,
  returnsArray,
  covariance,
  correlation,
  beta,
  annualizeReturn,
  annualizeVol,
  sharpeRatio,
  historicalVaR,
  parametricVaR,
  TRADING_DAYS,
};
