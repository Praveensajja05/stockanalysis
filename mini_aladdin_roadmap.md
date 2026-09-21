# Mini-Aladdin: Portfolio Risk & Analytics Engine — Build Roadmap
(v2 — reconciled with Gemini's backend work)

Today: July 23. OAs start 3rd week of October — that's ~12 weeks, not 4 months. Plan is scoped to that real deadline.
Pace: 5+ hrs/day available.

## Why this project
BlackRock's Aladdin platform is built around portfolio risk analytics. A scaled-down version signals genuine domain interest, not just "I can build CRUD apps." It's also a strong general SWE project regardless of company — full-stack, external data pipeline, non-trivial computation, deployed live. The finance framing is a bonus for BlackRock/fintech/quant firms, neutral everywhere else.

## Tech Stack (locked in)
- **Backend:** Node.js + Express + PostgreSQL. Staying in JS end-to-end (no Python) since you're learning JS from zero anyway and will need it for the frontend too — one new language, not two.
- **Frontend:** React + Recharts/Chart.js for the dashboard, React Router.
- **Data source:** a free market data API (Alpha Vantage free tier, or Twelve Data) for historical daily prices.
- **Auth:** JWT-based, simple email/password.
- **Caching (Redis):** deferred to week 6-7, added as an enhancement once the core engine works — not day 1. Bolting on three unfamiliar technologies (Express, Postgres, Redis) simultaneously before you've written a server is a recipe for stalling out.
- **Deployment:** Frontend on Vercel, backend on Render/Railway, DB on Supabase or Render Postgres (free tiers).

If your DSA has actually been in Python rather than C++/Java, tell me — that could change the backend language call.

## Database Schema
Gemini's schema is a good relational foundation, kept mostly as-is, with one critical addition: a price history table. Without it, you cannot compute volatility, VaR, Sharpe, or correlation — all of those need a time series, not a single current price.

```sql
-- Users
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Portfolios (a user can have multiple)
CREATE TABLE portfolios (
    portfolio_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Assets (master list of tradable instruments)
CREATE TABLE assets (
    ticker VARCHAR(10) PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    asset_class VARCHAR(50) NOT NULL, -- 'Equity', 'ETF', etc.
    current_price DECIMAL(15,4),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Price History (REQUIRED for all risk metrics — Gemini's schema was missing this)
CREATE TABLE price_history (
    id BIGSERIAL PRIMARY KEY,
    ticker VARCHAR(10) REFERENCES assets(ticker),
    price_date DATE NOT NULL,
    close_price DECIMAL(15,4) NOT NULL,
    CONSTRAINT unique_ticker_date UNIQUE (ticker, price_date)
);

-- Positions (holdings within a portfolio)
CREATE TABLE positions (
    position_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id UUID REFERENCES portfolios(portfolio_id) ON DELETE CASCADE,
    ticker VARCHAR(10) REFERENCES assets(ticker),
    shares DECIMAL(15,4) NOT NULL,
    average_buy_price DECIMAL(15,4) NOT NULL,
    CONSTRAINT unique_portfolio_asset UNIQUE (portfolio_id, ticker)
);
```

## Core Features (must-have)
1. **Portfolio builder** — create portfolios, add/remove positions (tickers + shares).
2. **Price data pipeline** — fetch and store historical daily prices for held tickers.
3. **Returns & risk metrics** — daily/annualized returns, volatility, Sharpe ratio, max drawdown.
4. **Value at Risk (VaR)** — historical VaR and parametric VaR at 95%/99% confidence.
5. **Correlation matrix** — pairwise correlation between holdings.
6. **Beta calculation** — portfolio beta vs a benchmark index.
7. **Dashboard UI (React)** — equity curve, metric cards, correlation heatmap, allocation pie chart. This is what makes it a "web dev project" and demoable, not just an API tested in Postman.
8. **Auth + multi-portfolio support.**

## Stretch Features (pick at most 1)
- **Redis caching** for the risk-metric endpoints once they're computationally heavier — a legitimate performance story if you can explain what you profiled and why.
- **Monte Carlo VaR simulation.**
- **Stress testing** against historical shock scenarios (2008, 2020 crash returns).

A polished core beats a half-built stretch feature in an interview, every time.

## Concepts to learn (and be ready to defend)
- Daily vs annualized returns, log vs simple returns
- Standard deviation as a volatility proxy, and its limitations
- Sharpe ratio — and why not Sortino/Treynor
- Historical VaR vs parametric VaR — parametric assumes normal distribution, which real returns don't follow (good interview talking point)
- Correlation vs covariance, why diversification reduces portfolio variance
- Beta as a systematic risk measure
- ACID compliance and why it matters for financial records (ties to your Postgres choice)

Investopedia + a few YouTube explainers gets you conversational fluency in about a week — no finance background needed.

## Week-by-Week Plan (9 weeks build, then DSA-only)

**Week 1 — Fundamentals**
- Client-server model, HTTP, JSON (already covered).
- Finish JS: functions, arrays/objects, destructuring, promises/async-await.
- SQL basics: SELECT/INSERT/UPDATE/JOIN, primary/foreign keys.
- Resource: freeCodeCamp JS course, official Postgres tutorial.

**Week 2 — Node/Express + schema**
- Learn Express routing, middleware, request/response cycle.
- Set up Postgres locally, run the schema above.
- Build basic CRUD: create user, create portfolio, add/remove positions.
- Rename any placeholder function names (e.g. don't ship a function called `praveen()` — use `bootstrapServer()` or similar).

**Week 3 — Price data pipeline**
- Integrate a market data API, fetch + store historical prices into `price_history`.
- Deliverable: can pull 1+ years of daily prices for any held ticker.

**Week 4 — Risk engine (the core of the project)**
- Build the computation layer: returns, volatility, Sharpe, max drawdown, correlation matrix, beta.
- Deliverable: `/portfolio/:id/metrics` endpoint returns full risk metrics JSON.

**Week 5 — VaR + start React frontend**
- Implement historical + parametric VaR.
- React basics: components, state, useEffect, routing.
- Deliverable: dashboard can call the metrics endpoint and render raw numbers.

**Week 6 — Dashboard + auth**
- Equity curve chart, metric cards, correlation heatmap, allocation pie chart.
- JWT auth, multi-portfolio support in the UI.
- Deliverable: functional multi-user app, locally.

**Week 7 — Stretch feature + polish**
- Add Redis caching or one other stretch feature.
- Handle edge cases: invalid tickers, empty portfolios, failed API calls.

**Week 8 — Deployment**
- Deploy frontend (Vercel), backend (Render/Railway), DB (Supabase/Render).
- Write a strong README: architecture, methodology, assumptions/limitations, screenshots.

**Week 9 — Interview prep for the project itself**
- Fix bugs from your own testing.
- Prepare a 2-minute verbal walkthrough.
- Rehearse answers: "why VaR over other risk measures", "how would you scale this", "limitations of your approach", "how would you add real-time pricing".

**Week 10 onward (~early October) — Full shift to DSA/CS fundamentals**
- Project is done and resume-ready.
- DSA practice, OS/DBMS/CN/OOP fundamentals, mock interviews until OAs begin.

## Resume Line (draft, refine once built)
"Built a full-stack portfolio risk analytics platform (React, Node.js/Express, PostgreSQL) computing VaR (historical & parametric), Sharpe ratio, correlation matrices, and portfolio beta on live market data; deployed with JWT-authenticated multi-portfolio support."
