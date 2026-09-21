# Mini-Aladdin — Portfolio Risk & Analytics Engine

A full-stack application that computes portfolio-level risk analytics on real
market data — a scaled-down take on the kind of risk platform BlackRock's
Aladdin provides. Users build portfolios of holdings, and the engine computes
returns, volatility, Sharpe ratio, maximum drawdown, correlation, beta, and
Value at Risk (VaR) — at both the single-asset and the weighted portfolio level.

## What it does

- Register / log in (JWT auth); each user only sees their own portfolios.
- Create portfolios and add positions (ticker, shares, average buy price).
- Pull historical daily prices for any ticker from the Alpha Vantage API and
  store them locally.
- Compute, on demand:
  - **Returns** — daily simple returns.
  - **Volatility** — sample standard deviation of returns, annualized.
  - **Sharpe ratio** — annualized excess return per unit of volatility.
  - **Maximum drawdown** — largest peak-to-trough decline.
  - **Correlation** — between any two tickers, date-aligned.
  - **Beta** — of any ticker versus the S&P 500 (SPY).
  - **Value at Risk** — historical and parametric, 95% confidence.
  - **Portfolio risk** — weighted, date-aligned aggregation across all holdings,
    including VaR expressed in dollars.

## Tech stack

| Layer     | Choice                                    |
| --------- | ----------------------------------------- |
| Frontend  | React (Vite)                              |
| Backend   | Node.js + Express                         |
| Database  | PostgreSQL                                |
| Auth      | bcrypt (password hashing) + JWT           |
| Data      | Alpha Vantage `TIME_SERIES_DAILY` API     |

## Architecture

```
frontend (React / Vite)          backend (Express)              PostgreSQL
  App.jsx  ───fetch + JWT───►  server.js (routes)  ───SQL───►  users
  api.js                       auth.js (register/login/JWT)     portfolios
                               financeUtils.js (pure math)      assets
                               db/pool.js (connection pool)     price_history
                                                                positions
```

The risk math lives in `financeUtils.js` as pure, dependency-free functions, so
it is unit-tested independently of the database and HTTP layer
(`financeUtils.test.js`). Routes are thin: they fetch rows, call the helpers,
and return JSON.

## Data model

- **users** — `user_id`, `username`, `email`, `password_hash`.
- **portfolios** — `portfolio_id`, `user_id` (FK), `name`. One user → many portfolios.
- **assets** — `ticker` (PK), `company_name`, `asset_class`.
- **price_history** — `ticker` (FK), `price_date`, `close_price`, unique on
  `(ticker, price_date)`. Required for every risk metric — they need a time
  series, not a single price.
- **positions** — `position_id`, `portfolio_id` (FK), `ticker` (FK), `shares`,
  `average_buy_price`, unique on `(portfolio_id, ticker)`.

The foreign key from `price_history` and `positions` to `assets` guarantees no
price or holding can exist for an unregistered asset — data integrity enforced
by the database, not just application code.

## Methodology & assumptions

This section states the modelling choices explicitly — they are deliberate and
defensible, not accidental.

- **Returns** are simple daily returns, `(P_t − P_{t−1}) / P_{t−1}`.
- **Volatility** uses the **sample** standard deviation (divides by `n − 1`),
  because the observed returns are a sample, not the full population.
- **Annualization** uses 252 trading days: return × 252, volatility × √252.
- **Sharpe ratio** uses a **US** risk-free rate (~4.5%), matching the currency
  of the US-listed assets (AAPL, MSFT, SPY). The rate is a named parameter, not
  a buried constant.
- **Correlation and beta** align the two return series **by date** (intersection
  of trading days), never by array position. This prevents silent misalignment
  when one ticker is missing a day.
- **Historical VaR** takes the empirical percentile of actual returns — no
  distribution assumed.
- **Parametric VaR** assumes normally distributed returns and uses a z-score
  (1.645 at 95%, 2.33 at 99%). Real returns have fatter tails than a normal
  distribution, so parametric VaR typically **understates** extreme risk
  relative to historical VaR — the two are expected to differ, and the gap is
  itself informative.
- **Portfolio value and weights** are derived from the **latest close in
  `price_history`** (a single source of truth), not a separately stored price.
- **Portfolio return** on each shared date is the weighted sum of holding
  returns; portfolio VaR is then computed on that combined series.

## Setup

### Prerequisites
Node.js, PostgreSQL, and a free Alpha Vantage API key
(https://www.alphavantage.co/support/#api-key).

### Backend
```bash
npm install express pg dotenv cors bcryptjs jsonwebtoken
npm install --save-dev nodemon
```
Create `.env` in the project root:
```
DB_USER=postgres
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=stockanalysis
ALPHA_VANTAGE_KEY=your_key
JWT_SECRET=some_long_random_string
```
Create the database and run the schema (the five `CREATE TABLE` statements), then:
```bash
nodemon server.js        # http://localhost:3000
node financeUtils.test.js  # run the math tests (should print "15 passed")
```

### Frontend
```bash
cd frontend
npm install
npm run dev              # http://localhost:5173
```

### First run
1. Register a user in the UI.
2. Seed a few tickers: insert them into `assets`, then call
   `GET /assets/<TICKER>/fetch-prices` for each (e.g. AAPL, MSFT, SPY).
3. Create a portfolio, add positions, and hit **View risk**.

## API (selected)

| Method | Route                                | Auth | Purpose                          |
| ------ | ------------------------------------ | ---- | -------------------------------- |
| POST   | `/auth/register`                     | –    | Create account, returns JWT      |
| POST   | `/auth/login`                        | –    | Log in, returns JWT              |
| POST   | `/portfolios`                        | ✓    | Create a portfolio               |
| POST   | `/portfolios/:id/positions`          | ✓    | Add a holding                    |
| GET    | `/portfolios/:id/allocation`         | ✓    | Weights & market value           |
| GET    | `/portfolios/:id/risk`               | ✓    | Weighted portfolio risk          |
| GET    | `/assets/:ticker/fetch-prices`       | –    | Load price history               |
| GET    | `/assets/:ticker/volatility`         | –    | Annualized volatility            |
| GET    | `/assets/:ticker/var-historical`     | –    | Historical VaR (95%)             |
| GET    | `/correlation/:t1/:t2`               | –    | Correlation between two tickers  |
| GET    | `/beta/:ticker`                      | –    | Beta vs SPY                      |

## Testing

`financeUtils.test.js` verifies the math with mathematical invariants that must
hold regardless of input — e.g. `correlation(x, x) = 1`, `correlation(x, −x) = −1`,
`beta(x, x) = 1`, VaR ≥ 0, and correct date-alignment. Run with `node financeUtils.test.js`.

## Known limitations & future work

Being explicit about these is deliberate — each is a conscious scope decision.

- **Data window**: Alpha Vantage's free tier returns ~100 daily points and is
  rate-limited, so metrics reflect a short recent window. Beta in particular is
  sensitive to the window and will differ from long-run published figures.
- **No caching**: every request recomputes from the database. Redis caching of
  computed metrics is the natural next optimization (and only worth adding after
  profiling shows it's needed).
- **Prices are not real-time**: they are refreshed only when `fetch-prices` runs.
- **Tests cover the math layer**, not yet the routes; API integration tests are
  a sensible next step.
- **Parametric VaR assumes normality**, which understates tail risk; a
  Monte Carlo VaR or a fat-tailed distribution would improve realism.
- **Single benchmark** (SPY) for beta; configurable benchmarks would generalize it.
```
