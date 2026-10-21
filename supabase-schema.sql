-- ============================================================
-- Eldesign Poultry Farm — Supabase (PostgreSQL) Schema
-- Run this in the Supabase SQL Editor before using sync.
-- Drop and recreate if re-running: run the DROP block first.
-- ============================================================

-- ─── USERS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              BIGINT PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT,
  role            TEXT NOT NULL DEFAULT 'viewer',
  is_active       INTEGER NOT NULL DEFAULT 1,
  invite_token    TEXT UNIQUE,
  invite_expires_at TEXT,
  created_by      BIGINT REFERENCES users(id),
  created_at      TEXT,
  last_login_at   TEXT
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read users" ON users FOR SELECT USING (true);


-- ─── ACTIVITY LOG ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_log (
  id          BIGINT PRIMARY KEY,
  user_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  user_name   TEXT,
  user_email  TEXT,
  action      TEXT NOT NULL,
  entity      TEXT,
  entity_id   BIGINT,
  details     TEXT,
  created_at  TEXT
);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read activity_log" ON activity_log FOR SELECT USING (true);


-- ─── FLOCKS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flocks (
  id                 BIGINT PRIMARY KEY,
  name               TEXT NOT NULL UNIQUE,
  color              TEXT NOT NULL DEFAULT '#2563eb',
  is_active          INTEGER NOT NULL DEFAULT 1,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  initial_bird_count INTEGER NOT NULL DEFAULT 0,
  date_acquired      TEXT,
  breed              TEXT,
  expected_lay_end   TEXT,
  target_yield_pct   REAL NOT NULL DEFAULT 80,
  created_at         TEXT
);

ALTER TABLE flocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read flocks" ON flocks FOR SELECT USING (true);


-- ─── FLOCK MOVEMENTS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flock_movements (
  id         BIGINT PRIMARY KEY,
  date       TEXT NOT NULL,
  month_year TEXT NOT NULL,
  flock_id   BIGINT NOT NULL REFERENCES flocks(id) ON DELETE CASCADE,
  count      INTEGER NOT NULL DEFAULT 0,
  reason     TEXT NOT NULL DEFAULT 'Death',
  notes      TEXT,
  created_at TEXT,
  updated_at TEXT
);

ALTER TABLE flock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read flock_movements" ON flock_movements FOR SELECT USING (true);


-- ─── PRODUCTION ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS production (
  id              BIGINT PRIMARY KEY,
  date            TEXT NOT NULL,
  month_year      TEXT NOT NULL,
  flock_id        BIGINT REFERENCES flocks(id) ON DELETE SET NULL,
  layer_type      TEXT,
  no_of_birds     INTEGER NOT NULL DEFAULT 0,
  crates          INTEGER NOT NULL DEFAULT 0,
  pieces          INTEGER NOT NULL DEFAULT 0,
  total_eggs      INTEGER,
  daily_yield_pct REAL,
  created_at      TEXT,
  updated_at      TEXT
);

ALTER TABLE production ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read production" ON production FOR SELECT USING (true);


-- ─── CREDIT CUSTOMERS (must come before sales + credit_sales) ─
CREATE TABLE IF NOT EXISTS credit_customers (
  id         BIGINT PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT,
  notes      TEXT,
  created_at TEXT,
  updated_at TEXT
);

ALTER TABLE credit_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read credit_customers" ON credit_customers FOR SELECT USING (true);


-- ─── CREDIT SALES (must come before sales) ───────────────────
CREATE TABLE IF NOT EXISTS credit_sales (
  id              BIGINT PRIMARY KEY,
  date            TEXT NOT NULL,
  month_year      TEXT NOT NULL,
  customer_id     BIGINT NOT NULL REFERENCES credit_customers(id) ON DELETE RESTRICT,
  egg_size        TEXT NOT NULL DEFAULT 'Medium',
  price_per_crate REAL NOT NULL DEFAULT 0,
  crates          INTEGER NOT NULL DEFAULT 0,
  pieces          INTEGER NOT NULL DEFAULT 0,
  amount_owed     REAL,
  amount_paid     REAL NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'unpaid',
  notes           TEXT,
  created_at      TEXT,
  updated_at      TEXT
);

ALTER TABLE credit_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read credit_sales" ON credit_sales FOR SELECT USING (true);


-- ─── SALES ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales (
  id                 BIGINT PRIMARY KEY,
  date               TEXT NOT NULL,
  month_year         TEXT NOT NULL,
  egg_size           TEXT NOT NULL,
  price_per_crate    REAL NOT NULL DEFAULT 0,
  flock_id           BIGINT REFERENCES flocks(id) ON DELETE SET NULL,
  layer_type         TEXT,
  crates             INTEGER NOT NULL DEFAULT 0,
  pieces             INTEGER NOT NULL DEFAULT 0,
  total_revenue      REAL,
  payment_status     TEXT NOT NULL DEFAULT 'cash',
  buyer_name         TEXT,
  created_at         TEXT,
  updated_at         TEXT
);

ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read sales" ON sales FOR SELECT USING (true);


-- ─── EXPENSES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id             BIGINT PRIMARY KEY,
  date           TEXT NOT NULL,
  month_year     TEXT NOT NULL,
  category       TEXT NOT NULL,
  description    TEXT,
  payment_method TEXT DEFAULT 'Cash',
  amount         REAL NOT NULL DEFAULT 0,
  feed_type      TEXT,
  quantity_kg    REAL,
  bags           REAL,
  supplier       TEXT,
  created_at     TEXT,
  updated_at     TEXT
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read expenses" ON expenses FOR SELECT USING (true);


-- ─── DOMESTIC USAGE ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS domestic_usage (
  id         BIGINT PRIMARY KEY,
  date       TEXT NOT NULL,
  month_year TEXT NOT NULL,
  location   TEXT,
  crates     INTEGER NOT NULL DEFAULT 0,
  pieces     INTEGER NOT NULL DEFAULT 0,
  flock_id   BIGINT REFERENCES flocks(id) ON DELETE SET NULL,
  layer_type TEXT,
  created_at TEXT,
  updated_at TEXT
);

ALTER TABLE domestic_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read domestic_usage" ON domestic_usage FOR SELECT USING (true);


-- ─── FEED LOG ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feed_log (
  id          BIGINT PRIMARY KEY,
  date        TEXT NOT NULL,
  month_year  TEXT NOT NULL,
  flock_id    BIGINT REFERENCES flocks(id) ON DELETE SET NULL,
  feed_type   TEXT NOT NULL DEFAULT 'Layers Mash',
  quantity_kg REAL NOT NULL DEFAULT 0,
  cost_per_kg REAL NOT NULL DEFAULT 0,
  total_cost  REAL,
  supplier    TEXT,
  notes       TEXT,
  created_at  TEXT,
  updated_at  TEXT
);

ALTER TABLE feed_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read feed_log" ON feed_log FOR SELECT USING (true);


-- ─── HEALTH RECORDS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS health_records (
  id              BIGINT PRIMARY KEY,
  date            TEXT NOT NULL,
  month_year      TEXT NOT NULL,
  flock_id        BIGINT REFERENCES flocks(id) ON DELETE SET NULL,
  record_type     TEXT NOT NULL DEFAULT 'Medication',
  name            TEXT NOT NULL,
  dosage          TEXT,
  administered_by TEXT,
  cost            REAL NOT NULL DEFAULT 0,
  next_due_date   TEXT,
  notes           TEXT,
  created_at      TEXT,
  updated_at      TEXT
);

ALTER TABLE health_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read health_records" ON health_records FOR SELECT USING (true);


-- ─── EGG PRICES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS egg_prices (
  id              BIGINT PRIMARY KEY,
  size            TEXT NOT NULL UNIQUE,
  price_per_crate REAL NOT NULL DEFAULT 0,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  updated_at      TEXT
);

ALTER TABLE egg_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read egg_prices" ON egg_prices FOR SELECT USING (true);


-- ─── OPENING STOCK ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS opening_stock (
  id         BIGINT PRIMARY KEY,
  month_year TEXT NOT NULL,
  flock_id   BIGINT REFERENCES flocks(id) ON DELETE CASCADE,
  crates     INTEGER NOT NULL DEFAULT 0,
  pieces     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT,
  UNIQUE(month_year, flock_id)
);

ALTER TABLE opening_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read opening_stock" ON opening_stock FOR SELECT USING (true);


-- ─── MONTHLY BALANCE ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monthly_balance (
  id              BIGINT PRIMARY KEY,
  month_year      TEXT NOT NULL UNIQUE,
  opening_balance REAL NOT NULL DEFAULT 0,
  notes           TEXT,
  created_at      TEXT,
  updated_at      TEXT
);

ALTER TABLE monthly_balance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read monthly_balance" ON monthly_balance FOR SELECT USING (true);


-- ─── APP SETTINGS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read app_settings" ON app_settings FOR SELECT USING (true);


-- ─── DEBT PAYMENTS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS debt_payments (
  id             BIGINT PRIMARY KEY,
  credit_sale_id BIGINT NOT NULL REFERENCES credit_sales(id) ON DELETE CASCADE,
  date           TEXT NOT NULL,
  month_year     TEXT NOT NULL,
  amount         REAL NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'Cash',
  notes          TEXT,
  created_at     TEXT
);

ALTER TABLE debt_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read debt_payments" ON debt_payments FOR SELECT USING (true);


-- ============================================================
-- UPSERT PERMISSIONS (anon key can insert + update)
-- ============================================================

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'users','activity_log','flocks','flock_movements','production',
    'sales','expenses','domestic_usage','feed_log','health_records',
    'egg_prices','opening_stock','monthly_balance','app_settings',
    'credit_customers','credit_sales','debt_payments'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('CREATE POLICY "anon upsert %I" ON %I FOR INSERT WITH CHECK (true)', tbl, tbl);
    EXECUTE format('CREATE POLICY "anon update %I" ON %I FOR UPDATE USING (true)', tbl, tbl);
  END LOOP;
END $$;
