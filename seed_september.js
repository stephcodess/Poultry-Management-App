/**
 * Seed script — Eldesign Poultry September 2026 data
 * Run from repo root: node seed_september.js
 */
const Database = require('better-sqlite3')
const path = require('path')

const DB_PATH = path.join(__dirname, 'poultry.db')
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

const MONTH = '2026-09'

// ── helpers ───────────────────────────────────────────────────────────────────
function getOrCreateFlock(name, color, initialBirds) {
  let f = db.prepare('SELECT id FROM flocks WHERE name = ?').get(name)
  if (!f) {
    const r = db.prepare(
      'INSERT INTO flocks (name, color, is_active, sort_order, initial_bird_count) VALUES (?, ?, 1, ?, ?)'
    ).run(name, color, name.includes('Old') ? 0 : 1, initialBirds)
    f = { id: r.lastInsertRowid }
    console.log(`  Created flock "${name}" id=${f.id}`)
  } else {
    console.log(`  Flock "${name}" already exists id=${f.id}`)
  }
  return f.id
}

// ── clear existing September data (idempotent re-run) ─────────────────────────
console.log('\n=== Clearing existing September 2026 data ===')
db.prepare("DELETE FROM production     WHERE month_year = ?").run(MONTH)
db.prepare("DELETE FROM opening_stock  WHERE month_year = ?").run(MONTH)
db.prepare("DELETE FROM sales          WHERE month_year = ?").run(MONTH)
db.prepare("DELETE FROM domestic_usage WHERE month_year = ?").run(MONTH)
db.prepare("DELETE FROM expenses       WHERE month_year = ?").run(MONTH)
db.prepare("DELETE FROM health_records WHERE month_year = ?").run(MONTH)
db.prepare("DELETE FROM monthly_balance WHERE month_year = ?").run(MONTH)
console.log('  Done.')

// ── flocks ────────────────────────────────────────────────────────────────────
console.log('\n=== Flocks ===')
const L1 = getOrCreateFlock('Old Layers (L1)', '#2563eb', 83)
const L2 = getOrCreateFlock('New Layers (L2)', '#16a34a', 37)

// ── opening balance ───────────────────────────────────────────────────────────
console.log('\n=== Opening Balance ===')
db.prepare(
  "INSERT INTO monthly_balance (month_year, opening_balance, notes) VALUES (?, ?, ?)"
).run(MONTH, 7900, 'September 2026 opening balance from Excel record')
console.log('  Opening balance NGN 7,900 inserted.')

// ── opening stock ─────────────────────────────────────────────────────────────
console.log('\n=== Opening Stock ===')
// Total opening: 2c 24p = 84 eggs, all from L1 (as per Excel)
db.prepare(
  "INSERT INTO opening_stock (month_year, flock_id, crates, pieces) VALUES (?, ?, ?, ?)"
).run(MONTH, L1, 2, 24)
console.log('  Opening stock: 2 crates 24 pieces (L1) inserted.')

// ── production ────────────────────────────────────────────────────────────────
console.log('\n=== Production (60 records) ===')
const insertProd = db.prepare(
  'INSERT INTO production (date, month_year, flock_id, layer_type, no_of_birds, crates, pieces) VALUES (@date, @month_year, @flock_id, @layer_type, @no_of_birds, @crates, @pieces)'
)

const productionData = [
  // date, flock_id, layer_type, no_of_birds, crates, pieces
  ['2026-09-01', L1, 'L1', 83, 1, 12],
  ['2026-09-01', L2, 'L2', 37, 0, 18],
  ['2026-09-02', L1, 'L1', 83, 1, 14],
  ['2026-09-02', L2, 'L2', 37, 0, 21],
  ['2026-09-03', L1, 'L1', 82, 1, 15],
  ['2026-09-03', L2, 'L2', 37, 0, 22],
  ['2026-09-04', L1, 'L1', 82, 1, 18],
  ['2026-09-04', L2, 'L2', 37, 0, 24],
  ['2026-09-05', L1, 'L1', 82, 1, 25],
  ['2026-09-05', L2, 'L2', 37, 0, 21],
  ['2026-09-06', L1, 'L1', 82, 1, 27],
  ['2026-09-06', L2, 'L2', 37, 0, 21],
  ['2026-09-07', L1, 'L1', 82, 2,  0],
  ['2026-09-07', L2, 'L2', 36, 0, 25],
  ['2026-09-08', L1, 'L1', 82, 1, 19],
  ['2026-09-08', L2, 'L2', 36, 0, 24],
  ['2026-09-09', L1, 'L1', 82, 1, 28],
  ['2026-09-09', L2, 'L2', 36, 0, 23],
  ['2026-09-10', L1, 'L1', 82, 1, 15],
  ['2026-09-10', L2, 'L2', 36, 0, 21],
  ['2026-09-11', L1, 'L1', 82, 1, 23],
  ['2026-09-11', L2, 'L2', 36, 0, 26],
  ['2026-09-12', L1, 'L1', 82, 1, 25],
  ['2026-09-12', L2, 'L2', 36, 0, 22],
  ['2026-09-13', L1, 'L1', 82, 1, 19],
  ['2026-09-13', L2, 'L2', 35, 0, 22],
  ['2026-09-14', L1, 'L1', 82, 1, 21],
  ['2026-09-14', L2, 'L2', 35, 0, 23],
  ['2026-09-15', L1, 'L1', 81, 1, 22],
  ['2026-09-15', L2, 'L2', 35, 0, 23],
  ['2026-09-16', L1, 'L1', 81, 1, 19],
  ['2026-09-16', L2, 'L2', 35, 0, 26],
  ['2026-09-17', L1, 'L1', 81, 1, 29],
  ['2026-09-17', L2, 'L2', 35, 0, 26],
  ['2026-09-18', L1, 'L1', 81, 2,  2],
  ['2026-09-18', L2, 'L2', 35, 0, 26],
  ['2026-09-19', L1, 'L1', 81, 1, 26],
  ['2026-09-19', L2, 'L2', 35, 0, 22],
  ['2026-09-20', L1, 'L1', 81, 1, 21],
  ['2026-09-20', L2, 'L2', 35, 0, 25],
  ['2026-09-21', L1, 'L1', 81, 1, 19],
  ['2026-09-21', L2, 'L2', 35, 0, 22],
  ['2026-09-22', L1, 'L1', 81, 1, 28],
  ['2026-09-22', L2, 'L2', 35, 0, 27],
  ['2026-09-23', L1, 'L1', 81, 1, 17],
  ['2026-09-23', L2, 'L2', 35, 0, 27],
  ['2026-09-24', L1, 'L1', 81, 1, 26],
  ['2026-09-24', L2, 'L2', 35, 0, 26],
  ['2026-09-25', L1, 'L1', 81, 1, 19],
  ['2026-09-25', L2, 'L2', 35, 0, 26],
  ['2026-09-26', L1, 'L1', 81, 1, 20],
  ['2026-09-26', L2, 'L2', 35, 0, 26],
  ['2026-09-27', L1, 'L1', 81, 1, 23],
  ['2026-09-27', L2, 'L2', 35, 0, 26],
  ['2026-09-28', L1, 'L1', 81, 1, 21],
  ['2026-09-28', L2, 'L2', 35, 0, 21],
  ['2026-09-29', L1, 'L1', 81, 1, 17],
  ['2026-09-29', L2, 'L2', 35, 0, 25],
  ['2026-09-30', L1, 'L1', 81, 1, 20],
  ['2026-09-30', L2, 'L2', 35, 0, 22],
]

const insertProdTx = db.transaction(() => {
  for (const [date, flock_id, layer_type, no_of_birds, crates, pieces] of productionData) {
    insertProd.run({ date, month_year: MONTH, flock_id, layer_type, no_of_birds, crates, pieces })
  }
})
insertProdTx()
console.log(`  ${productionData.length} production records inserted.`)

// ── sales ─────────────────────────────────────────────────────────────────────
console.log('\n=== Sales (57 records) ===')
const insertSale = db.prepare(
  'INSERT INTO sales (date, month_year, egg_size, price_per_crate, flock_id, layer_type, crates, pieces) VALUES (@date, @month_year, @egg_size, @price_per_crate, @flock_id, @layer_type, @crates, @pieces)'
)

// [date, egg_size, price, flock_id, layer_type, crates, pieces]
const salesData = [
  ['2026-09-01', 'Big',    5000, L2, 'L2', 2,  0],
  ['2026-09-01', 'Medium', 4800, L1, 'L1', 1, 15],
  ['2026-09-03', 'Big',    5000, L1, 'L1', 1,  0],
  ['2026-09-03', 'Medium', 4800, L1, 'L1', 1,  0],
  ['2026-09-03', 'Medium', 4800, L2, 'L2', 1,  0],
  ['2026-09-05', 'Big',    5000, L1, 'L1', 2,  0],
  ['2026-09-06', 'Medium', 4800, L2, 'L2', 1,  0],
  ['2026-09-06', 'Medium', 4800, L1, 'L1', 1,  0],
  ['2026-09-07', 'Big',    5000, L1, 'L1', 1,  0],
  ['2026-09-07', 'Big',    5000, L2, 'L2', 1,  0],
  ['2026-09-08', 'Medium', 4800, L1, 'L1', 1,  0],
  ['2026-09-09', 'Medium', 4800, L1, 'L1', 2,  0],
  ['2026-09-09', 'Medium', 4800, L2, 'L2', 1,  0],
  ['2026-09-09', 'Medium', 4800, L1, 'L1', 1, 15],
  ['2026-09-10', 'Medium', 4800, L2, 'L2', 1,  0],
  ['2026-09-10', 'Big',    5000, L1, 'L1', 1,  0],
  ['2026-09-11', 'Medium', 4800, L1, 'L1', 1,  0],
  ['2026-09-12', 'Big',    5000, L1, 'L1', 2,  0],
  ['2026-09-12', 'Big',    5000, L2, 'L2', 1,  0],
  ['2026-09-12', 'Medium', 4800, L1, 'L1', 4,  0],
  ['2026-09-12', 'Medium', 4800, L2, 'L2', 1,  0],
  ['2026-09-12', 'Medium', 4800, L2, 'L2', 0, 15],
  ['2026-09-13', 'Medium', 4800, L1, 'L1', 1,  0],
  ['2026-09-13', 'Big',    5000, L2, 'L2', 1,  0],
  ['2026-09-14', 'Medium', 4800, L1, 'L1', 1,  0],
  ['2026-09-15', 'Medium', 4800, L2, 'L2', 1,  0],
  ['2026-09-15', 'Medium', 4800, L1, 'L1', 2,  0],
  ['2026-09-15', 'Big',    5000, L1, 'L1', 1,  0],
  ['2026-09-15', 'Big',    5000, L2, 'L2', 1,  0],
  ['2026-09-15', 'Medium', 4800, L1, 'L1', 1, 15],
  ['2026-09-17', 'Medium', 4800, L2, 'L2', 1,  0],
  ['2026-09-17', 'Medium', 4800, L1, 'L1', 2,  0],
  ['2026-09-17', 'Big',    5000, L1, 'L1', 1,  0],
  ['2026-09-17', 'Big',    5000, L2, 'L2', 1,  0],
  ['2026-09-18', 'Big',    5000, L1, 'L1', 1,  0],
  ['2026-09-18', 'Medium', 4800, L2, 'L2', 1,  0],
  ['2026-09-18', 'Medium', 4800, L1, 'L1', 0, 15],
  ['2026-09-20', 'Medium', 4800, L2, 'L2', 1,  0],
  ['2026-09-20', 'Big',    5000, L1, 'L1', 0, 15],
  ['2026-09-22', 'Medium', 4800, L1, 'L1', 2, 15],
  ['2026-09-22', 'Medium', 4800, L2, 'L2', 0, 15],
  ['2026-09-22', 'Big',    5000, L1, 'L1', 2,  0],
  ['2026-09-22', 'Big',    5000, L2, 'L2', 0, 15],
  ['2026-09-23', 'Big',    5000, L1, 'L1', 2,  0],
  ['2026-09-23', 'Medium', 4800, L2, 'L2', 1, 15],
  ['2026-09-25', 'Medium', 4800, L1, 'L1', 2,  0],
  ['2026-09-25', 'Medium', 4800, L2, 'L2', 1,  0],
  ['2026-09-25', 'Big',    5000, L2, 'L2', 1,  0],
  ['2026-09-25', 'Big',    5000, L1, 'L1', 2,  0],
  ['2026-09-26', 'Medium', 4800, L1, 'L1', 0, 15],
  ['2026-09-27', 'Big',    5000, L1, 'L1', 2,  0],
  ['2026-09-27', 'Medium', 4800, L1, 'L1', 1,  0],
  ['2026-09-27', 'Big',    5000, L2, 'L2', 1,  0],
  ['2026-09-29', 'Medium', 4800, L2, 'L2', 1,  0],
  ['2026-09-29', 'Medium', 4800, L1, 'L1', 2,  0],
  ['2026-09-29', 'Big',    5000, L1, 'L1', 2,  0],
  ['2026-09-29', 'Medium', 4800, L2, 'L2', 0, 15],
]

const insertSalesTx = db.transaction(() => {
  for (const [date, egg_size, price_per_crate, flock_id, layer_type, crates, pieces] of salesData) {
    insertSale.run({ date, month_year: MONTH, egg_size, price_per_crate, flock_id, layer_type, crates, pieces })
  }
})
insertSalesTx()
console.log(`  ${salesData.length} sales records inserted.`)

// ── domestic usage ────────────────────────────────────────────────────────────
console.log('\n=== Domestic Usage (3 records) ===')
const insertDom = db.prepare(
  'INSERT INTO domestic_usage (date, month_year, location, crates, pieces, flock_id, layer_type) VALUES (@date, @month_year, @location, @crates, @pieces, @flock_id, @layer_type)'
)
const domesticData = [
  ['2026-09-18', 'Gift to Grandma',  0, 15, L1, 'L1'],
  ['2026-09-19', 'SGB Household',    0, 15, L1, 'L1'],
  ['2026-09-19', 'Ibadan',           1,  0, L1, 'L1'],
]
const insertDomTx = db.transaction(() => {
  for (const [date, location, crates, pieces, flock_id, layer_type] of domesticData) {
    insertDom.run({ date, month_year: MONTH, location, crates, pieces, flock_id, layer_type })
  }
})
insertDomTx()
console.log(`  ${domesticData.length} domestic usage records inserted.`)

// ── expenses ──────────────────────────────────────────────────────────────────
console.log('\n=== Expenses (43 records) ===')
const insertExp = db.prepare(
  'INSERT INTO expenses (date, month_year, category, description, payment_method, amount) VALUES (@date, @month_year, @category, @description, @payment_method, @amount)'
)

// [date, category, description, payment_method, amount]
const expensesData = [
  ['2026-09-04', 'Medication',    'Baby Ram treatment',              'Transfer',  5000],
  ['2026-09-08', 'Maintenance',   'Cleaning',                        'Transfer',  7500],
  ['2026-09-09', 'Maintenance',   'Plumbing materials',              'Transfer',  5500],
  ['2026-09-10', 'Feed',          'Feed purchase balance',           'Cash',     30500],
  ['2026-09-11', 'Medication',    'Calcium',                         'Cash',      1200],
  ['2026-09-11', 'Medication',    'Penicillin',                      'Cash',       700],
  ['2026-09-11', 'Transport',     'Transportation',                  'Cash',      1200],
  ['2026-09-12', 'Fuel',          'Petrol',                          'Transfer',  6000],
  ['2026-09-12', 'Labour',        'Weight checking / Labour cost',   'Transfer',  5000],
  ['2026-09-17', 'Miscellaneous', 'Household',                       'Cash',      3000],
  ['2026-09-17', 'Maintenance',   'Chlorine',                        'Transfer',  4000],
  ['2026-09-17', 'Utilities',     'Household soap',                  'Transfer',  5000],
  ['2026-09-17', 'Maintenance',   'Nail purchase',                   'Cash',      1200],
  ['2026-09-17', 'Labour',        'Carpenter work',                  'Transfer', 12000],
  ['2026-09-17', 'Maintenance',   'Cleaning',                        'Cash',      7500],
  ['2026-09-18', 'Maintenance',   'Cement purchase',                 'Transfer', 65000],
  ['2026-09-18', 'Transport',     'Cement transportation',           'Cash',      2000],
  ['2026-09-18', 'Miscellaneous', 'Household',                       'Cash',     10200],
  ['2026-09-18', 'Transport',     'Transportation',                  'Transfer',  6000],
  ['2026-09-18', 'Transport',     'Roofing sheet transportation',    'Cash',      2000],
  ['2026-09-18', 'Maintenance',   'Nail purchase',                   'Cash',      2000],
  ['2026-09-18', 'Labour',        'Welder job',                      'Cash',      2000],
  ['2026-09-19', 'Feed',          'Compounded feed',                 'Transfer', 16700],
  ['2026-09-19', 'Feed',          'Cassava peel',                    'Transfer',  8000],
  ['2026-09-19', 'Miscellaneous', 'MD cash received',                'Cash',      2500],
  ['2026-09-19', 'Utilities',     'Household',                       'Cash',      4000],
  ['2026-09-20', 'Maintenance',   'Chair repairs',                   'Transfer', 19000],
  ['2026-09-22', 'Maintenance',   'Cleaning',                        'Cash',      8000],
  ['2026-09-22', 'Maintenance',   'Nail purchase',                   'Cash',      6000],
  ['2026-09-22', 'Transport',     'Transportation',                  'Cash',       500],
  ['2026-09-24', 'Labour',        'Carpenter work',                  'Transfer', 20000],
  ['2026-09-25', 'Labour',        'Roheemat bonus',                  'Cash',      5000],
  ['2026-09-26', 'Maintenance',   'Nail purchase',                   'Cash',      3400],
  ['2026-09-26', 'Labour',        'Carpenter work',                  'Transfer', 24000],
  ['2026-09-26', 'Labour',        'Welder job',                      'Transfer',  7000],
  ['2026-09-29', 'Labour',        'Bricklayer work',                 'Transfer', 17000],
  ['2026-09-30', 'Maintenance',   'Cleaning',                        'Cash',      8000],
  ['2026-09-30', 'Medication',    'Liver booster',                   'Transfer', 11000],
  ['2026-09-30', 'Medication',    'Lasota (Vaccine)',                'Transfer',  5000],
  ['2026-09-30', 'Medication',    'Calcium',                         'Transfer',  2500],
  ['2026-09-30', 'Medication',    'Multivitamins',                   'Transfer',  4400],
  ['2026-09-30', 'Medication',    'Syringe',                         'Transfer',   500],
  ['2026-09-30', 'Medication',    'Maxiyield',                       'Transfer',  3500],
]

const insertExpTx = db.transaction(() => {
  for (const [date, category, description, payment_method, amount] of expensesData) {
    insertExp.run({ date, month_year: MONTH, category, description, payment_method, amount })
  }
})
insertExpTx()
console.log(`  ${expensesData.length} expense records inserted.`)

// ── health records (extracted from expenses — drugs & vaccines) ───────────────
console.log('\n=== Health Records (from drug/vaccine expenses) ===')
const insertHealth = db.prepare(
  'INSERT INTO health_records (date, month_year, flock_id, record_type, name, dosage, administered_by, cost, next_due_date, notes) VALUES (@date, @month_year, @flock_id, @record_type, @name, @dosage, @administered_by, @cost, @next_due_date, @notes)'
)

const healthData = [
  // [date, record_type, name, dosage, cost, notes]
  ['2026-09-04', 'Treatment',   'Baby Ram',       null, 5000,  'Baby Ram treatment — Running Cost'],
  ['2026-09-11', 'Medication',  'Calcium',        null, 1200,  null],
  ['2026-09-11', 'Medication',  'Penicillin',     null,  700,  null],
  ['2026-09-30', 'Medication',  'Liver Booster',  null, 11000, null],
  ['2026-09-30', 'Vaccination', 'Lasota',         null, 5000,  'Newcastle disease vaccine'],
  ['2026-09-30', 'Medication',  'Calcium',        null, 2500,  null],
  ['2026-09-30', 'Medication',  'Multivitamins',  null, 4400,  null],
  ['2026-09-30', 'Medication',  'Maxiyield',      null, 3500,  null],
]

const insertHealthTx = db.transaction(() => {
  for (const [date, record_type, name, dosage, cost, notes] of healthData) {
    insertHealth.run({
      date, month_year: MONTH, flock_id: null,
      record_type, name, dosage: dosage || null,
      administered_by: null, cost, next_due_date: null, notes: notes || null
    })
  }
})
insertHealthTx()
console.log(`  ${healthData.length} health records inserted.`)

// ── verify totals ─────────────────────────────────────────────────────────────
console.log('\n=== Verification ===')
const prodCount  = db.prepare("SELECT COUNT(*) as n FROM production     WHERE month_year = ?").get(MONTH)
const salesCount = db.prepare("SELECT COUNT(*) as n FROM sales          WHERE month_year = ?").get(MONTH)
const domCount   = db.prepare("SELECT COUNT(*) as n FROM domestic_usage WHERE month_year = ?").get(MONTH)
const expCount   = db.prepare("SELECT COUNT(*) as n FROM expenses       WHERE month_year = ?").get(MONTH)
const hlthCount  = db.prepare("SELECT COUNT(*) as n FROM health_records WHERE month_year = ?").get(MONTH)

const totalEggs  = db.prepare("SELECT SUM(total_eggs) as t FROM production WHERE month_year = ?").get(MONTH)
const totalRev   = db.prepare("SELECT SUM(total_revenue) as t FROM sales   WHERE month_year = ?").get(MONTH)
const totalExp   = db.prepare("SELECT SUM(amount) as t FROM expenses       WHERE month_year = ?").get(MONTH)

console.log(`  Production rows : ${prodCount.n}  (expect 60)`)
console.log(`  Sales rows      : ${salesCount.n}  (expect 57)`)
console.log(`  Domestic rows   : ${domCount.n}   (expect 3)`)
console.log(`  Expense rows    : ${expCount.n}  (expect 43)`)
console.log(`  Health rows     : ${hlthCount.n}   (expect 8)`)
console.log(`  Total eggs prod : ${totalEggs.t}  (expect 2259)`)
console.log(`  Gross revenue   : NGN ${totalRev.t?.toLocaleString()}  (expect 356,400)`)
console.log(`  Total expenses  : NGN ${totalExp.t?.toLocaleString()}  (expect 360,500)`)

console.log('\n✅ Seed complete!')
db.close()
