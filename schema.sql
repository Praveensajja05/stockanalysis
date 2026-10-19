-- Mini-Aladdin schema. Run once: psql -d <your_db> -f schema.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid() on Postgres < 13

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

-- Price History
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
