const Database = require('better-sqlite3')
const path = require('path')
const { app } = require('electron')
const bcrypt = require('bcryptjs')

let db

function getDb() {
  return db
}

function initDatabase() {
  const dbPath = app.isPackaged
    ? path.join(app.getPath('userData'), 'poultry.db')
    : path.join(__dirname, '../../poultry.db')

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  runMigrations()
  return db
}

function runMigrations() {

  // ── USERS & ACTIVITY ────────────────────────────────────────────────────────
  // All staff live here. role='none' = staff-only (no app login).
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      name               TEXT    NOT NULL,
      email              TEXT    UNIQUE,
      password_hash      TEXT,
      role               TEXT    NOT NULL DEFAULT 'viewer',
      position           TEXT,
      phone              TEXT,
      is_active          INTEGER NOT NULL DEFAULT 1,
      invite_token       TEXT    UNIQUE,
      invite_expires_at  TEXT,
      created_by         INTEGER REFERENCES users(id),
      created_at         TEXT    DEFAULT (datetime('now')),
      last_login_at      TEXT
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_name   TEXT,
      user_email  TEXT,
      action      TEXT NOT NULL,
      entity      TEXT,
      entity_id   INTEGER,
      details     TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_user    ON activity_log(user_id);
  `)

  // ── FLOCKS ──────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS flocks (
      id                       INTEGER PRIMARY KEY AUTOINCREMENT,
      name                     TEXT    NOT NULL UNIQUE,
      color                    TEXT    NOT NULL DEFAULT '#2563eb',
      is_active                INTEGER NOT NULL DEFAULT 1,
      sort_order               INTEGER NOT NULL DEFAULT 0,
      initial_bird_count       INTEGER NOT NULL DEFAULT 0,
      date_acquired            TEXT,
      breed                    TEXT,
      expected_lay_end         TEXT,
      target_yield_pct         REAL    NOT NULL DEFAULT 80,
      age_weeks_at_acquisition INTEGER,
      created_at               TEXT    DEFAULT (datetime('now'))
    );
  `)

  // ── FLOCK MOVEMENTS ─────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS flock_movements (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      date       TEXT    NOT NULL,
      month_year TEXT    NOT NULL,
      flock_id   INTEGER NOT NULL REFERENCES flocks(id) ON DELETE CASCADE,
      count      INTEGER NOT NULL DEFAULT 0,
      reason     TEXT    NOT NULL DEFAULT 'Death',
      notes      TEXT,
      created_at TEXT    DEFAULT (datetime('now')),
      updated_at TEXT    DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_movements_month ON flock_movements(month_year);
  `)

  // ── PRODUCTION ──────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS production (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      date            TEXT    NOT NULL,
      month_year      TEXT    NOT NULL,
      flock_id        INTEGER REFERENCES flocks(id) ON DELETE SET NULL,
      layer_type      TEXT,
      no_of_birds     INTEGER NOT NULL DEFAULT 0,
      crates          INTEGER NOT NULL DEFAULT 0,
      pieces          INTEGER NOT NULL DEFAULT 0,
      total_eggs      INTEGER GENERATED ALWAYS AS (crates * 30 + pieces) STORED,
      daily_yield_pct REAL    GENERATED ALWAYS AS (
        CASE WHEN no_of_birds > 0
             THEN ROUND((crates * 30.0 + pieces) / no_of_birds * 100, 1)
             ELSE 0 END
      ) STORED,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_production_month ON production(month_year);
  `)

  // ── OPENING STOCK ───────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS opening_stock (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      month_year TEXT    NOT NULL,
      flock_id   INTEGER REFERENCES flocks(id) ON DELETE CASCADE,
      crates     INTEGER NOT NULL DEFAULT 0,
      pieces     INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    DEFAULT (datetime('now')),
      UNIQUE(month_year, flock_id)
    );
  `)

  // ── EGG PRICES ──────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS egg_prices (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      size           TEXT    NOT NULL UNIQUE,
      price_per_crate REAL   NOT NULL DEFAULT 0,
      sort_order     INTEGER NOT NULL DEFAULT 0,
      updated_at     TEXT    DEFAULT (datetime('now'))
    );
  `)

  // ── SALES ───────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      date               TEXT    NOT NULL,
      month_year         TEXT    NOT NULL,
      egg_size           TEXT    NOT NULL,
      price_per_crate    REAL    NOT NULL DEFAULT 0,
      flock_id           INTEGER REFERENCES flocks(id) ON DELETE SET NULL,
      layer_type         TEXT,
      crates             INTEGER NOT NULL DEFAULT 0,
      pieces             INTEGER NOT NULL DEFAULT 0,
      total_revenue      REAL    GENERATED ALWAYS AS ((crates + pieces / 30.0) * price_per_crate) STORED,
      payment_status     TEXT    NOT NULL DEFAULT 'cash',
      credit_customer_id INTEGER REFERENCES credit_customers(id) ON DELETE SET NULL,
      credit_sale_id     INTEGER REFERENCES credit_sales(id) ON DELETE SET NULL,
      buyer_name         TEXT,
      created_at         TEXT    DEFAULT (datetime('now')),
      updated_at         TEXT    DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sales_month ON sales(month_year);
  `)

  // ── DOMESTIC USAGE ──────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS domestic_usage (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      date       TEXT    NOT NULL,
      month_year TEXT    NOT NULL,
      location   TEXT,
      crates     INTEGER NOT NULL DEFAULT 0,
      pieces     INTEGER NOT NULL DEFAULT 0,
      flock_id   INTEGER REFERENCES flocks(id) ON DELETE SET NULL,
      layer_type TEXT,
      created_at TEXT    DEFAULT (datetime('now')),
      updated_at TEXT    DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_domestic_month ON domestic_usage(month_year);
  `)

  // ── CREDIT CUSTOMERS ────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS credit_customers (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      phone      TEXT,
      notes      TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `)

  // ── CREDIT SALES ────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS credit_sales (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      date           TEXT    NOT NULL,
      month_year     TEXT    NOT NULL,
      customer_id    INTEGER NOT NULL REFERENCES credit_customers(id) ON DELETE RESTRICT,
      egg_size       TEXT    NOT NULL DEFAULT 'Medium',
      price_per_crate REAL   NOT NULL DEFAULT 0,
      crates         INTEGER NOT NULL DEFAULT 0,
      pieces         INTEGER NOT NULL DEFAULT 0,
      amount_owed    REAL    GENERATED ALWAYS AS ((crates + pieces / 30.0) * price_per_crate) STORED,
      amount_paid    REAL    NOT NULL DEFAULT 0,
      status         TEXT    NOT NULL DEFAULT 'unpaid',
      notes          TEXT,
      created_at     TEXT    DEFAULT (datetime('now')),
      updated_at     TEXT    DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_credit_sales_month    ON credit_sales(month_year);
    CREATE INDEX IF NOT EXISTS idx_credit_sales_customer ON credit_sales(customer_id);
  `)

  // ── DEBT PAYMENTS ───────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS debt_payments (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      credit_sale_id INTEGER NOT NULL REFERENCES credit_sales(id) ON DELETE CASCADE,
      date           TEXT    NOT NULL,
      month_year     TEXT    NOT NULL,
      amount         REAL    NOT NULL DEFAULT 0,
      payment_method TEXT    NOT NULL DEFAULT 'Cash',
      notes          TEXT,
      created_at     TEXT    DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_debt_payments_month ON debt_payments(month_year);
  `)

  // ── EXPENSES ────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      date           TEXT    NOT NULL,
      month_year     TEXT    NOT NULL,
      category       TEXT    NOT NULL,
      description    TEXT,
      payment_method TEXT    DEFAULT 'Cash',
      amount         REAL    NOT NULL DEFAULT 0,
      feed_type      TEXT,
      quantity_kg    REAL,
      bags           REAL,
      supplier       TEXT,
      staff_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at     TEXT    DEFAULT (datetime('now')),
      updated_at     TEXT    DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_month ON expenses(month_year);
  `)

  // ── FEED LOG ────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS feed_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        TEXT    NOT NULL,
      month_year  TEXT    NOT NULL,
      flock_id    INTEGER REFERENCES flocks(id) ON DELETE SET NULL,
      feed_type   TEXT    NOT NULL DEFAULT 'Layers Mash',
      quantity_kg REAL    NOT NULL DEFAULT 0,
      cost_per_kg REAL    NOT NULL DEFAULT 0,
      total_cost  REAL    GENERATED ALWAYS AS (quantity_kg * cost_per_kg) STORED,
      supplier    TEXT,
      notes       TEXT,
      created_at  TEXT    DEFAULT (datetime('now')),
      updated_at  TEXT    DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_feed_month ON feed_log(month_year);
  `)

  // ── HEALTH RECORDS ──────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS health_records (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      date            TEXT    NOT NULL,
      month_year      TEXT    NOT NULL,
      flock_id        INTEGER REFERENCES flocks(id) ON DELETE SET NULL,
      record_type     TEXT    NOT NULL DEFAULT 'Medication',
      name            TEXT    NOT NULL,
      dosage          TEXT,
      administered_by TEXT,
      cost            REAL    NOT NULL DEFAULT 0,
      next_due_date   TEXT,
      notes           TEXT,
      created_at      TEXT    DEFAULT (datetime('now')),
      updated_at      TEXT    DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_health_month ON health_records(month_year);
  `)

  // ── WATER LOG ───────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS water_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      date       TEXT    NOT NULL,
      month_year TEXT    NOT NULL,
      flock_id   INTEGER REFERENCES flocks(id) ON DELETE SET NULL,
      litres     REAL    NOT NULL DEFAULT 0,
      notes      TEXT,
      created_at TEXT    DEFAULT (datetime('now')),
      updated_at TEXT    DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_water_month ON water_log(month_year);
  `)

  // ── MONTHLY BALANCE ─────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS monthly_balance (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      month_year      TEXT    NOT NULL UNIQUE,
      opening_balance REAL    NOT NULL DEFAULT 0,
      notes           TEXT,
      created_at      TEXT    DEFAULT (datetime('now')),
      updated_at      TEXT    DEFAULT (datetime('now'))
    );
  `)

  // ── SETTINGS ────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `)

  // ── OFFLINE SYNC QUEUE ──────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS offline_queue (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name   TEXT NOT NULL,
      remote_table TEXT,
      operation    TEXT NOT NULL CHECK(operation IN ('upsert','delete')),
      conflict_key TEXT NOT NULL,
      payload      TEXT NOT NULL,
      created_at   TEXT DEFAULT (datetime('now'))
    );
  `)

  // ── ALTER TABLE GUARDS (existing databases) ─────────────────────────────────
  // These are no-ops on fresh databases where the columns already exist.
  // They safely add columns that were introduced in later migrations.

  // users: staff fields
  try { db.exec('ALTER TABLE users ADD COLUMN position TEXT') } catch {}
  try { db.exec('ALTER TABLE users ADD COLUMN phone TEXT') } catch {}

  // flocks: lifecycle fields
  try { db.exec('ALTER TABLE flocks ADD COLUMN date_acquired TEXT') } catch {}
  try { db.exec('ALTER TABLE flocks ADD COLUMN breed TEXT') } catch {}
  try { db.exec('ALTER TABLE flocks ADD COLUMN expected_lay_end TEXT') } catch {}
  try { db.exec('ALTER TABLE flocks ADD COLUMN target_yield_pct REAL NOT NULL DEFAULT 80') } catch {}
  try { db.exec('ALTER TABLE flocks ADD COLUMN age_weeks_at_acquisition INTEGER') } catch {}

  // expenses: feed purchase + staff assignment fields
  try { db.exec('ALTER TABLE expenses ADD COLUMN feed_type TEXT') } catch {}
  try { db.exec('ALTER TABLE expenses ADD COLUMN supplier TEXT') } catch {}
  try { db.exec('ALTER TABLE expenses ADD COLUMN quantity_kg REAL') } catch {}
  try { db.exec('ALTER TABLE expenses ADD COLUMN bags REAL') } catch {}
  try { db.exec('ALTER TABLE expenses ADD COLUMN staff_id INTEGER REFERENCES users(id) ON DELETE SET NULL') } catch {}

  // sales: credit + payment fields
  try { db.exec("ALTER TABLE sales ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'cash'") } catch {}
  try { db.exec('ALTER TABLE sales ADD COLUMN credit_customer_id INTEGER REFERENCES credit_customers(id) ON DELETE SET NULL') } catch {}
  try { db.exec('ALTER TABLE sales ADD COLUMN credit_sale_id INTEGER REFERENCES credit_sales(id) ON DELETE SET NULL') } catch {}
  try { db.exec('ALTER TABLE sales ADD COLUMN buyer_name TEXT') } catch {}

  // ── SEEDS ────────────────────────────────────────────────────────────────────

  // Default flocks
  const flockCount = db.prepare('SELECT COUNT(*) as cnt FROM flocks').get()
  if (flockCount.cnt === 0) {
    db.prepare('INSERT INTO flocks (name, color, sort_order, initial_bird_count) VALUES (?, ?, ?, ?)').run('Old Layers (L1)', '#2563eb', 0, 0)
    db.prepare('INSERT INTO flocks (name, color, sort_order, initial_bird_count) VALUES (?, ?, ?, ?)').run('New Layers (L2)', '#16a34a', 1, 0)
  }

  // Default egg prices
  const priceCount = db.prepare('SELECT COUNT(*) as cnt FROM egg_prices').get()
  if (priceCount.cnt === 0) {
    const ins = db.prepare('INSERT INTO egg_prices (size, price_per_crate, sort_order) VALUES (?, ?, ?)')
    ins.run('Small',  5200, 0)
    ins.run('Medium', 4800, 1)
    ins.run('Big',    5000, 2)
    ins.run('Others', 0,    3)
  }

  // Default settings (INSERT OR IGNORE — never overwrites user-saved values)
  const upsert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
  ;[
    ['farm_name',              'Eldesign Poultry Farm'],
    ['farm_location',          'Osogbo, Osun State'],
    ['opening_balance',        '0'],
    ['eggs_per_crate',         '30'],
    ['feed_opening_stock_kg',  '0'],
    ['feed_daily_kg_per_bird', '0.12'],
    ['supabase_url',           ''],
    ['supabase_anon_key',      ''],
    ['last_sync_at',           ''],
  ].forEach(([k, v]) => upsert.run(k, v))

  // Owner account seed (local fallback — Supabase is source of truth)
  const masterEmail    = process.env.MASTER_EMAIL
  const masterPassword = process.env.MASTER_PASSWORD
  if (masterEmail) {
    const existing = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(masterEmail)
    if (!existing) {
      const hash = masterPassword ? bcrypt.hashSync(masterPassword, 12) : null
      db.prepare("INSERT INTO users (name, email, role, is_active, password_hash) VALUES (?, ?, 'owner', 1, ?)").run('Farm Owner', masterEmail, hash)
    } else if (!existing.password_hash && masterPassword) {
      db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(bcrypt.hashSync(masterPassword, 12), masterEmail)
    }
  }
}

module.exports = { initDatabase, getDb }
