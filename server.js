// server.js — Mini-Aladdin backend (stage 2: auth added)
// New in this version:
//   - /auth/register and /auth/login (see auth.js)
//   - portfolio routes now require a valid JWT (authenticate middleware)
//   - a user can only touch their OWN portfolios (assertPortfolioOwner)
//   - creating a portfolio uses the user_id from the TOKEN, not the request body
// Market/price routes stay public — that's reference data, not user data.
// Requires: npm install express pg dotenv cors bcryptjs jsonwebtoken

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db/pool.js');
const fin = require('./financeUtils.js');
const { asyncHandler, httpError } = require('./httpHelpers.js');
const { router: authRouter, authenticate } = require('./auth.js');

const app = express();
app.use(cors());
app.use(express.json());
app.use(authRouter); // mounts /auth/register and /auth/login

// --- helpers ---------------------------------------------------------------

async function getPriceRows(ticker) {
  const r = await pool.query(
    'SELECT price_date, close_price FROM price_history WHERE ticker = $1 ORDER BY price_date ASC',
    [ticker]
  );
  if (r.rows.length < 2) {
    throw httpError(`Not enough price history for ${ticker} (need at least 2 rows)`, 404);
  }
  return r.rows;
}

// 404 if the portfolio doesn't exist, 403 if it isn't the caller's.
async function assertPortfolioOwner(portfolioId, userId) {
  const r = await pool.query('SELECT user_id FROM portfolios WHERE portfolio_id = $1', [portfolioId]);
  if (r.rows.length === 0) throw httpError('Portfolio not found', 404);
  if (r.rows[0].user_id !== userId) throw httpError('Not your portfolio', 403);
}

// --- health ----------------------------------------------------------------

app.get('/', (req, res) => res.send('app is working'));

app.get('/db-test', asyncHandler(async (req, res) => {
  const r = await pool.query('SELECT NOW()');
  res.json(r.rows);
}));

// --- portfolios & positions (auth required) --------------------------------

app.post('/portfolios', authenticate, asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name) throw httpError('name is required', 400);
  // user_id comes from the verified token, never from the body — a user can't
  // create a portfolio "as" someone else.
  const r = await pool.query(
    'INSERT INTO portfolios (user_id, name) VALUES ($1, $2) RETURNING *',
    [req.user.user_id, name]
  );
  res.status(201).json(r.rows[0]);
}));

app.get('/portfolios/:id', authenticate, asyncHandler(async (req, res) => {
  await assertPortfolioOwner(req.params.id, req.user.user_id);
  const r = await pool.query('SELECT * FROM portfolios WHERE portfolio_id = $1', [req.params.id]);
  res.json(r.rows[0]);
}));

app.post('/portfolios/:id/positions', authenticate, asyncHandler(async (req, res) => {
  await assertPortfolioOwner(req.params.id, req.user.user_id);
  const { ticker, shares, average_buy_price } = req.body;
  if (!ticker || shares == null || average_buy_price == null) {
    throw httpError('ticker, shares and average_buy_price are required', 400);
  }
  const r = await pool.query(
    'INSERT INTO positions (ticker, shares, average_buy_price, portfolio_id) VALUES ($1, $2, $3, $4) RETURNING *',
    [ticker, shares, average_buy_price, req.params.id]
  );
  res.status(201).json(r.rows[0]);
}));

app.get('/portfolios/:id/positions', authenticate, asyncHandler(async (req, res) => {
  await assertPortfolioOwner(req.params.id, req.user.user_id);
  const r = await pool.query(
    `SELECT p.*, a.company_name,
       (SELECT close_price FROM price_history ph
        WHERE ph.ticker = p.ticker ORDER BY price_date DESC LIMIT 1) AS latest_price
     FROM positions p
     JOIN assets a ON p.ticker = a.ticker
     WHERE p.portfolio_id = $1`,
    [req.params.id]
  );
  res.json(r.rows);
}));

// --- price data pipeline (public reference data) ---------------------------

app.get('/assets/:ticker/fetch-prices', asyncHandler(async (req, res) => {
  const ticker = req.params.ticker;
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&apikey=${process.env.ALPHA_VANTAGE_KEY}`;
  const response = await fetch(url);
  const data = await response.json();

  const timeSeries = data['Time Series (Daily)'];
  if (!timeSeries) {
    throw httpError(
      data['Note'] || data['Information'] || data['Error Message'] || 'No price data returned',
      502
    );
  }

  let count = 0;
  for (const [date, priceData] of Object.entries(timeSeries)) {
    await pool.query(
      `INSERT INTO price_history (ticker, price_date, close_price)
       VALUES ($1, $2, $3)
       ON CONFLICT (ticker, price_date) DO UPDATE SET close_price = EXCLUDED.close_price`,
      [ticker, date, priceData['4. close']]
    );
    count++;
  }
  res.json({ message: `Upserted ${count} rows for ${ticker}` });
}));

// --- single-asset risk metrics (public) ------------------------------------

app.get('/assets/:ticker/returns', asyncHandler(async (req, res) => {
  const map = fin.dailyReturnsByDate(await getPriceRows(req.params.ticker));
  res.json([...map.entries()].map(([price_date, ret]) => ({ price_date, return: ret })));
}));

app.get('/assets/:ticker/volatility', asyncHandler(async (req, res) => {
  const returns = fin.returnsArray(await getPriceRows(req.params.ticker));
  const daily = fin.sampleStdDev(returns);
  res.json({ ticker: req.params.ticker, dailyVolatility: daily, annualizedVolatility: fin.annualizeVol(daily) });
}));

app.get('/assets/:ticker/sharpe', asyncHandler(async (req, res) => {
  const returns = fin.returnsArray(await getPriceRows(req.params.ticker));
  res.json({ ticker: req.params.ticker, sharpeRatio: fin.sharpeRatio(returns) });
}));

app.get('/assets/:ticker/maxdrawdown', asyncHandler(async (req, res) => {
  const rows = await getPriceRows(req.params.ticker);
  let peak = parseFloat(rows[0].close_price);
  let maxDrawdown = 0;
  for (const row of rows) {
    const price = parseFloat(row.close_price);
    if (price > peak) peak = price;
    const dd = (peak - price) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  res.json({ ticker: req.params.ticker, maxDrawdown });
}));

app.get('/assets/:ticker/var-historical', asyncHandler(async (req, res) => {
  const returns = fin.returnsArray(await getPriceRows(req.params.ticker));
  res.json({ ticker: req.params.ticker, confidence: 0.95, varHistorical: fin.historicalVaR(returns, 0.95) });
}));

app.get('/assets/:ticker/var-parametric', asyncHandler(async (req, res) => {
  const returns = fin.returnsArray(await getPriceRows(req.params.ticker));
  res.json({ ticker: req.params.ticker, confidence: 0.95, varParametric: fin.parametricVaR(returns, 0.95) });
}));

// --- two-asset metrics, date-aligned (public) ------------------------------

app.get('/correlation/:ticker1/:ticker2', asyncHandler(async (req, res) => {
  const rows1 = await getPriceRows(req.params.ticker1);
  const rows2 = await getPriceRows(req.params.ticker2);
  const { a, b, dates } = fin.alignReturns(fin.dailyReturnsByDate(rows1), fin.dailyReturnsByDate(rows2));
  if (a.length < 2) throw httpError('Not enough overlapping dates between the two tickers', 422);
  res.json({ ticker1: req.params.ticker1, ticker2: req.params.ticker2, daysUsed: dates.length, correlation: fin.correlation(a, b) });
}));

app.get('/beta/:ticker', asyncHandler(async (req, res) => {
  const assetRows = await getPriceRows(req.params.ticker);
  const benchRows = await getPriceRows('SPY');
  const { a, b, dates } = fin.alignReturns(fin.dailyReturnsByDate(assetRows), fin.dailyReturnsByDate(benchRows));
  if (a.length < 2) throw httpError('Not enough overlapping dates with SPY', 422);
  res.json({ ticker: req.params.ticker, benchmark: 'SPY', daysUsed: dates.length, beta: fin.beta(a, b) });
}));

// --- portfolio-level analytics (auth + ownership) --------------------------

app.get('/portfolios/:id/allocation', authenticate, asyncHandler(async (req, res) => {
  await assertPortfolioOwner(req.params.id, req.user.user_id);
  const r = await pool.query(
    `SELECT p.ticker, p.shares,
       (SELECT close_price FROM price_history ph
        WHERE ph.ticker = p.ticker ORDER BY price_date DESC LIMIT 1) AS latest_price
     FROM positions p
     WHERE p.portfolio_id = $1`,
    [req.params.id]
  );
  if (r.rows.length === 0) throw httpError('No positions for this portfolio', 404);

  const positions = r.rows.map((row) => ({
    ticker: row.ticker,
    marketValue: parseFloat(row.shares) * parseFloat(row.latest_price),
  }));
  const total = positions.reduce((acc, p) => acc + p.marketValue, 0);
  positions.forEach((p) => { p.weight = p.marketValue / total; });

  res.json({ totalPortfolioValue: total, positions });
}));

// THE CENTERPIECE — weighted, date-aligned portfolio risk.
app.get('/portfolios/:id/risk', authenticate, asyncHandler(async (req, res) => {
  await assertPortfolioOwner(req.params.id, req.user.user_id);

  // 1. holdings + market value using latest price (single source of truth)
  const holdingsRes = await pool.query(
    `SELECT p.ticker, p.shares,
       (SELECT close_price FROM price_history ph
        WHERE ph.ticker = p.ticker ORDER BY price_date DESC LIMIT 1) AS latest_price
     FROM positions p
     WHERE p.portfolio_id = $1`,
    [req.params.id]
  );
  if (holdingsRes.rows.length === 0) throw httpError('No positions for this portfolio', 404);

  // 2. market values + weights
  const holdings = holdingsRes.rows.map((row) => ({
    ticker: row.ticker,
    marketValue: parseFloat(row.shares) * parseFloat(row.latest_price),
  }));
  const totalValue = holdings.reduce((acc, h) => acc + h.marketValue, 0);
  holdings.forEach((h) => { h.weight = h.marketValue / totalValue; });

  // 3. each holding's date->return map (await inside for..of, NOT forEach)
  for (const h of holdings) {
    const priceRes = await pool.query(
      'SELECT price_date, close_price FROM price_history WHERE ticker = $1 ORDER BY price_date ASC',
      [h.ticker]
    );
    h.returnMap = fin.dailyReturnsByDate(priceRes.rows);
  }

  // 4. dates present for EVERY holding (intersection) — align by date, not index
  let commonDates = [...holdings[0].returnMap.keys()];
  for (const h of holdings.slice(1)) {
    commonDates = commonDates.filter((d) => h.returnMap.has(d));
  }
  commonDates.sort();
  if (commonDates.length < 2) throw httpError('Not enough overlapping price history across holdings', 422);

  // 5. portfolio return each day = sum of (weight_i * return_i)
  const portfolioReturns = commonDates.map((date) =>
    holdings.reduce((acc, h) => acc + h.weight * h.returnMap.get(date), 0)
  );

  // 6. portfolio-level risk metrics, plus VaR in real dollars
  const dailyVol = fin.sampleStdDev(portfolioReturns);
  const var95 = fin.historicalVaR(portfolioReturns, 0.95);
  res.json({
    portfolioId: req.params.id,
    totalValue,
    daysUsed: portfolioReturns.length,
    holdings: holdings.map((h) => ({ ticker: h.ticker, weight: h.weight, marketValue: h.marketValue })),
    annualizedVolatility: fin.annualizeVol(dailyVol),
    sharpeRatio: fin.sharpeRatio(portfolioReturns),
    historicalVaR95: var95,
    parametricVaR95: fin.parametricVaR(portfolioReturns, 0.95),
    valueAtRisk95Dollars: var95 * totalValue,
  });
}));

// --- fallthrough 404 + central error handler (must be last) ----------------

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(3000, () => console.log('server running on port 3000'));
