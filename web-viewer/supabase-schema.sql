-- ============================================================
-- Eldesign Poultry Farm — Supabase (PostgreSQL) Schema
-- Run this in the Supabase SQL Editor before using sync.
-- ============================================================

-- Enable RLS (Row Level Security) — anon key gets read-only access
-- Auth is handled in the app itself, not via Supabase Auth.


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
-- Anon can read users (needed for web viewer login)
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
-- NOTE: total_eggs and daily_yield_pct are computed in SQLite as GENERATED ALWAYS columns.
-- In Postgres we store them as plain columns (synced from the Electron app).
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


-- ─── SALES ───────────────────────────────────────────────────
-- total_revenue is a GENERATED column in SQLite; stored as plain column here.
CREATE TABLE IF NOT EXISTS sales (
  id              BIGINT PRIMARY KEY,
  date            TEXT NOT NULL,
  month_year      TEXT NOT NULL,
  egg_size        TEXT NOT NULL,
  price_per_crate REAL NOT NULL DEFAULT 0,
  flock_id        BIGINT REFERENCES flocks(id) ON DELETE SET NULL,
  layer_type      TEXT,
  crates          INTEGER NOT NULL DEFAULT 0,
  pieces          INTEGER NOT NULL DEFAULT 0,
  total_revenue   REAL,
  created_at      TEXT,
  updated_at      TEXT
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
  -- Feed purchase fields (populated when category = 'Feed')
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
-- Records daily feed consumption per flock. Feed purchases are recorded in expenses.
CREATE TABLE IF NOT EXISTS feed_log (
  id          BIGINT PRIMARY KEY,
  date        TEXT NOT NULL,
  month_year  TEXT NOT NULL,
  flock_id    BIGINT REFERENCES flocks(id) ON DELETE SET NULL,
  feed_type   TEXT NOT NULL DEFAULT 'Layers Mash',
  quantity_kg REAL NOT NULL DEFAULT 0,
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


-- ─── SETTINGS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read settings" ON settings FOR SELECT USING (true);


-- ─── CREDIT CUSTOMERS ────────────────────────────────────────
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


-- ─── CREDIT SALES ────────────────────────────────────────────
-- amount_owed is GENERATED in SQLite; stored as plain column here.
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
-- UPSERT PERMISSIONS
-- The Electron app syncs via the anon key with upsert.
-- We need INSERT + UPDATE on anon for all tables.
-- ============================================================

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'users','activity_log','flocks','flock_movements','production',
    'sales','expenses','domestic_usage','feed_log','health_records',
    'egg_prices','opening_stock','monthly_balance','settings',
    'credit_customers','credit_sales','debt_payments'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('CREATE POLICY "anon upsert %I" ON %I FOR INSERT WITH CHECK (true)', tbl, tbl);
    EXECUTE format('CREATE POLICY "anon update %I" ON %I FOR UPDATE USING (true)', tbl, tbl);
  END LOOP;
END $$;
