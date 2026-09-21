# Mini-Aladdin — Complete Project Guide

A single reference that explains what the project is, every tool used, why each
was chosen over its alternatives, how the code fits together, and a transferable
way to make these decisions on future projects. Read it top to bottom once, then
use it as a lookup.

---

## 1. What this project is

Mini-Aladdin is a **portfolio risk and analytics engine**: a web application
where a user builds portfolios of stocks and the system computes how risky those
portfolios are, using real historical market data. It is a scaled-down version
of the kind of platform BlackRock's Aladdin provides to investment managers.

**One-line pitch:** "A full-stack portfolio risk engine that pulls live market
data and computes VaR, Sharpe ratio, volatility, beta, and correlation at both
the single-asset and weighted-portfolio level, with JWT-authenticated accounts."

**The 30-second version:** "The backend is Node/Express over PostgreSQL. It pulls
daily prices from a market-data API into the database, and a pure-function math
module turns those prices into risk metrics — returns, volatility, Sharpe, max
drawdown, correlation, beta, and Value at Risk two different ways. Users log in
with JWT auth and only see their own portfolios. The portfolio-level route
weights each holding and aligns their returns by date to produce one combined
risk figure. A React frontend calls the API and shows the numbers."

---

## 2. The architecture (how it all fits)

Three tiers plus an external data source:

```
  BROWSER                    SERVER                       DATA
  ┌─────────────┐  HTTP +   ┌────────────────────┐  SQL  ┌────────────┐
  │ React (Vite)│ ───JWT──► │ Express (server.js)│ ────► │ PostgreSQL │
  │ App.jsx     │ ◄──JSON── │ auth.js            │ ◄──── │ 5 tables   │
  │ api.js      │           │ financeUtils.js    │       └────────────┘
  └─────────────┘           │ db/pool.js         │  HTTPS ┌────────────┐
                            │                    │ ─────► │ Alpha      │
                            └────────────────────┘        │ Vantage API│
                                                          └────────────┘
```

- **Frontend** captures input and displays results. It holds no business logic —
  it just calls the API and renders JSON.
- **Backend** is the brain: authentication, database access, the risk math, and
  fetching external price data.
- **Database** is the single source of truth for users, portfolios, holdings,
  and price history.
- **External API** (Alpha Vantage) supplies the raw historical prices.

**Separation of concerns** is the key idea: each tier can be changed
independently. You could swap React for Vue, or Postgres for MySQL, without
rewriting the others, because they only talk through well-defined interfaces
(HTTP/JSON between browser and server; SQL between server and database).

---

## 3. Every tool — what it is, the alternatives, and why we chose it

This is the section interviewers probe hardest. For each tool: its role here,
the realistic alternatives, and the reason for the choice.

### Language: JavaScript on Node.js
- **Role:** the entire backend runs on Node; the frontend is also JavaScript.
- **Alternatives:** Python (FastAPI/Django), Java (Spring), Go.
- **Why chosen:** you were learning JS from scratch and *needed* it for the
  frontend regardless. Using it for the backend too meant **one language, not
  two** — the single biggest time-saver given the placement deadline. Node's
  non-blocking I/O is also well-suited to an API that spends its time waiting on
  the database and an external API.
- **Honest trade-off:** for a heavy *quant* engine, **Python** would be the more
  natural pick — pandas/NumPy make financial math trivial. We consciously traded
  that for single-language simplicity. Being able to say this out loud is a
  strength, not a weakness.

### Web framework: Express
- **Role:** defines the API routes, parses requests, sends responses.
- **Alternatives:** Fastify (faster, built-in validation), NestJS (structured,
  TypeScript, opinionated — better for large teams), the raw Node `http` module
  (too low-level), or Python's FastAPI/Django.
- **Why chosen:** minimal, unopinionated, and the most documented framework in
  existence — so when you hit an error, someone has already solved it. At this
  scale its lack of structure is fine; NestJS would add ceremony you don't need.

### Database: PostgreSQL
- **Role:** stores users, portfolios, holdings, and price history.
- **Alternatives:** MongoDB (document store), MySQL, SQLite.
- **Why chosen:** the data is inherently **relational** — users own portfolios,
  which contain positions, which reference assets. Postgres enforces that with
  foreign keys and ACID guarantees, which matters for financial data where a
  dropped or orphaned record is unacceptable. MongoDB's flexible documents are a
  poor fit for this shape and would push the join logic into your code. Postgres
  is also a stronger interview signal than Mongo for a finance project.
- **SQLite** would work for a purely local toy but isn't built for concurrent or
  production use; **MySQL** is close to Postgres but Postgres has richer features.

### Database access: `pg` (node-postgres), raw SQL — no ORM
- **Role:** the driver that lets Node run SQL against Postgres, via a connection
  pool.
- **Alternatives:** an ORM like Prisma, Sequelize, or TypeORM.
- **Why chosen:** writing raw SQL **forces you to actually learn SQL**, which is
  exactly what interviewers test — and it means you can explain precisely what
  every query does. An ORM hides the SQL behind method calls; convenient in
  production (migrations, type safety) but it would rob you of the learning and
  add its own abstraction to defend.
- **Trade-off:** a large production app would likely adopt an ORM or query
  builder for migrations and safety. Naming that shows maturity.

### Frontend library: React (with Vite)
- **Role:** builds the user interface as reusable components.
- **Alternatives:** Vue (gentler curve), Angular (heavy, enterprise), Svelte
  (compile-time, less boilerplate), or plain JavaScript.
- **Why chosen:** React is the most in-demand frontend skill and has the largest
  ecosystem and tutorial base — the safest bet for both employability and
  getting unstuck quickly.

### Build tool: Vite
- **Role:** dev server + bundler for the React app.
- **Alternatives:** Create React App (slow, effectively deprecated), Next.js
  (full framework with server-side rendering and routing), Parcel.
- **Why chosen:** fastest and simplest for a **client-side single-page app**.
  Next.js is excellent but adds server-side rendering and routing concerns this
  dashboard doesn't need — the wrong kind of complexity here.

### Auth: JWT + bcrypt
- **Role:** JWT proves who a logged-in user is on each request; bcrypt protects
  stored passwords.
- **JWT alternatives:** server-side **sessions** (state stored on the server,
  usually in Redis). **Why JWT:** it's **stateless** — the token itself carries
  the identity, so the server keeps no session store, which fits a SPA-plus-API
  cleanly. Trade-off: a JWT can't easily be revoked before it expires; sessions
  can. Good interview point.
- **bcrypt alternatives:** plain SHA-256 (**wrong** — too fast, so brute-forced
  easily), or **argon2**/scrypt. **Why bcrypt:** it's deliberately slow and
  salted, battle-tested, and trivial to use. argon2 is the modern upgrade worth
  naming as "what I'd consider next."

### Market data: Alpha Vantage
- **Role:** supplies historical daily closing prices.
- **Alternatives:** yfinance (Python library scraping Yahoo — generous but not a
  clean REST API and Python-only), Twelve Data (cleaner free tier), Polygon/IEX
  (better data, paid).
- **Why chosen:** free, no credit card, and a plain REST endpoint any language
  can call. **Trade-off:** the free tier is rate-limited and returns a short
  history (~100 days), which is why your metrics reflect a short recent window.

### Supporting tools
- **dotenv** — loads secrets (DB password, API key, JWT secret) from a
  `.env` file that is gitignored, so credentials never enter the codebase.
- **cors** — lets the browser app (port 5173) call the API (port 3000); browsers
  block cross-origin requests by default.
- **nodemon** — auto-restarts the server on file save during development.
- **Thunder Client / Postman** — send test requests to the API before a frontend
  exists.
- **Git / GitHub** — version control and hosting the repo.

---

## 4. The codebase, file by file

- **`db/pool.js`** — creates a PostgreSQL *connection pool* (a set of reusable
  connections) from the `.env` credentials and exports it. Every file that needs
  the database imports this one pool rather than opening its own connections.
- **`financeUtils.js`** — the heart. Pure functions with no database or HTTP
  inside: mean, sample standard deviation, returns-by-date, date alignment,
  covariance, correlation, beta, Sharpe, historical VaR, parametric VaR. Being
  pure makes it independently testable.
- **`httpHelpers.js`** — two shared helpers: `asyncHandler` (routes errors to
  one central handler so you don't write try/catch everywhere) and `httpError`
  (attaches an HTTP status code to an error).
- **`auth.js`** — `/auth/register` and `/auth/login` routes, plus the
  `authenticate` middleware that checks the JWT on protected routes.
- **`server.js`** — wires everything together: middleware, all the routes
  (portfolios, positions, price pipeline, single-asset metrics, correlation,
  beta, allocation, and the portfolio-level risk route), the 404 handler, and
  the central error handler.
- **`frontend/src/api.js`** — one wrapper around `fetch` that prepends the
  backend URL and attaches the JWT to every request.
- **`frontend/src/App.jsx`** — the UI: a login/register form, then a dashboard to
  create portfolios, add positions, and view allocation and risk.
- **`financeUtils.test.js`** — verifies the math with invariants that must always
  hold (correlation of a series with itself is 1, etc.).

---

## 5. The data model

Five tables, related by foreign keys:

- **users** (1) → **portfolios** (many): one user owns many portfolios.
- **portfolios** (1) → **positions** (many): one portfolio holds many positions.
- **assets** (1) → **positions** (many) and → **price_history** (many): every
  holding and every price references a registered asset.

The foreign keys guarantee integrity: you cannot store a price or a holding for
a ticker that doesn't exist in `assets`. `price_history` exists because every
risk metric needs a *time series* of prices, not a single current price.

---

## 6. A full request, traced end to end

"User clicks **View risk**":

1. `App.jsx` calls `api.risk(portfolioId)`.
2. `api.js` sends `GET /portfolios/:id/risk` with `Authorization: Bearer <JWT>`.
3. `authenticate` middleware verifies the JWT and attaches the user to the request.
4. The route checks the portfolio belongs to that user.
5. It queries the holdings and each holding's price history from Postgres.
6. `financeUtils` converts prices to returns, aligns them by date, weights them,
   and computes portfolio volatility, Sharpe, and VaR (including a dollar figure).
7. The route sends JSON back; `App.jsx` renders it in a table.

That single trace touches every layer — a great thing to be able to narrate in
an interview.

---

## 7. The finance in one page

You already have the detailed finance rundown; the essentials: **returns** are
daily percentage price changes and feed everything else. **Volatility** is the
standard deviation of returns. **Sharpe** is return per unit of risk.
**Correlation** (−1 to +1) is why diversification works. **Beta** measures
movement versus the market. **Max drawdown** is the worst peak-to-trough fall.
**VaR** answers "what's the most I'd plausibly lose in a day?" — computed two
ways (historical from real data, parametric assuming a normal distribution),
which disagree because real returns have fatter tails than a bell curve.

---

## 8. What else could go in — and when

Transferable knowledge: these are the common "next" tools and the signal that
tells you it's time to add each.

- **Redis (caching):** add when profiling shows repeated expensive computations;
  cache computed metrics. *Not before a real bottleneck exists.*
- **An ORM (Prisma):** add when the schema grows and you need migrations and type
  safety more than you need to hand-write SQL.
- **TypeScript:** add when the codebase is large enough that type errors start
  costing real time; it catches bugs before runtime.
- **Docker:** add when "works on my machine" becomes a problem — it packages the
  app + its environment so it runs identically anywhere.
- **A test framework (Jest/Vitest):** add when you want structured test suites
  and coverage beyond the plain-Node tests you have.
- **CI (GitHub Actions):** add to run tests automatically on every push.
- **WebSockets:** add if you need *live* streaming prices instead of on-demand
  fetches.
- **A cloud provider / managed DB:** add at deployment (Vercel + Render +
  managed Postgres).

The meta-lesson: **don't add infrastructure until a concrete problem demands
it.** Premature complexity is its own bug.

---

## 9. How to choose a stack for ANY project (transferable framework)

When you start your next project, decide in this order:

1. **Start from constraints, not preferences:** How much time? What do you
   already know? How many users, realistically? What's the domain?
2. **Pick the language by where the hard work is.** Heavy math/ML → Python.
   Real-time/high-concurrency → Node or Go. Large enterprise system → Java/C#.
   Everything else → what you already know fastest.
3. **Pick the database by data shape.** Structured and related → SQL (Postgres).
   Flexible, nested, schema-varying → document (MongoDB). Tiny/local → SQLite.
4. **Pick the framework by scale and team size.** Small/solo → minimal (Express,
   FastAPI). Large/team → opinionated (NestJS, Django, Spring).
5. **Pick the frontend by ecosystem and your familiarity.** Default React for
   employability; Vue for a gentler start; plain JS for something tiny.
6. **Add infrastructure lazily.** Caches, queues, microservices, and containers
   are answers to specific problems — add each only when you hit that problem.
7. **Under time pressure or while learning, prefer boring, well-documented
   tools.** The best tool is often the one with the most Stack Overflow answers.

If you can justify each choice with a sentence like the ones in Section 3, you
will handle any "why did you use X?" question an interviewer asks.

---

## 10. Your interview pitches

**30-second:** see Section 1.

**2-minute (add):** the design decisions — why Postgres over Mongo (relational
integrity for financial data), why the risk math is a separate pure module
(testability), why the portfolio route aligns returns by date (to avoid silently
wrong numbers when tickers have different trading days), why JWT over sessions
(stateless), and the honest limitations (short data window, no caching yet,
parametric VaR understates tail risk). Ending on limitations you chose
deliberately is what separates a candidate who *built* something from one who
*understands* what they built.
