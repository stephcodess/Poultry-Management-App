const { getDb } = require('../database/db')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const { saveSession, loadSession, clearSession } = require('./sessionManager')
const { logActivity } = require('./activityLogger')
const { pushRecord, flushOfflineQueue, fetchUserFromSupabase } = require('./supabaseSync')

function getSupabaseCreds() {
  return {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY,
  }
}

// Push a record to Supabase and queue if offline. tableName must match TABLES list.
async function syncWrite(tableName, operation, payload) {
  const { url, key } = getSupabaseCreds()
  if (!url || !key) return
  await pushRecord(getDb(), url, key, tableName, operation, payload)
}

// ─── CASH RECEIVED HELPER ─────────────────────────────────────────────────────
// "Cash received" for a month = cash sales revenue
//   + deposits collected on credit sales created that month
//   + debt repayments received in that month (may relate to prior-month credit sales)
// This is the only figure that should feed into wallet/balance calculations.
function getCashReceived(db, monthYear) {
  const cashSales = db.prepare(`
    SELECT COALESCE(SUM(total_revenue), 0) AS v
    FROM sales
    WHERE month_year = ? AND (payment_status = 'cash' OR payment_status IS NULL)
  `).get(monthYear).v

  const creditDeposits = db.prepare(`
    SELECT COALESCE(SUM(cs.amount_paid), 0) AS v
    FROM credit_sales cs
    WHERE cs.month_year = ? AND cs.amount_paid > 0
  `).get(monthYear).v

  const debtRepayments = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS v
    FROM debt_payments
    WHERE month_year = ?
  `).get(monthYear).v

  return cashSales + creditDeposits + debtRepayments
}

let _mainWindow = null
function setMainWindow(win) { _mainWindow = win }

function registerHandlers(ipcMain) {
  registerAuthHandlers(ipcMain)
  registerFlockHandlers(ipcMain)
  registerProductionHandlers(ipcMain)
  registerSalesHandlers(ipcMain)
  registerDomesticHandlers(ipcMain)
  registerExpensesHandlers(ipcMain)
  registerSettingsHandlers(ipcMain)
  registerDashboardHandlers(ipcMain)
  registerMortalityHandlers(ipcMain)
  registerFeedHandlers(ipcMain)
  registerWaterHandlers(ipcMain)
  registerHealthHandlers(ipcMain)
  registerBalanceInto(ipcMain)
  registerAIHandlers(ipcMain)
  registerDebtorsHandlers(ipcMain)
  registerReportHandlers(ipcMain)
  registerSyncHandlers(ipcMain)
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────

// Upsert a user row into the local SQLite cache
function cacheUser(db, user) {
  const cols = ['id', 'name', 'email', 'password_hash', 'role', 'is_active', 'created_at', 'last_login_at']
  const present = cols.filter(c => user[c] !== undefined)
  const placeholders = present.map(() => '?').join(', ')
  const updates = present.filter(c => c !== 'id').map(c => `${c} = excluded.${c}`).join(', ')
  db.prepare(`
    INSERT INTO users (${present.join(', ')}) VALUES (${placeholders})
    ON CONFLICT(id) DO UPDATE SET ${updates}
  `).run(...present.map(c => user[c] ?? null))
}

function registerAuthHandlers(ipcMain) {
  // Step 1: check email — Supabase first, SQLite cache fallback
  ipcMain.handle('auth:checkEmail', async (_, { email }) => {
    const db = getDb()
    const { url, key } = getSupabaseCreds()
    let user = null

    if (url && key) {
      try {
        user = await fetchUserFromSupabase(url, key, email)
        if (user) cacheUser(db, user)
      } catch {
        // fall through to cache
      }
    }

    if (!user) {
      user = db.prepare('SELECT id, name, email, role, password_hash, is_active FROM users WHERE email = ?').get(email)
    }

    if (!user) return { status: 'not_found' }
    if (!user.is_active) return { status: 'inactive' }
    if (!user.password_hash) return { status: 'pending', name: user.name }
    return { status: 'active', name: user.name }
  })

  // Step 2a: verify password — always against local hash (hash is synced from Supabase)
  ipcMain.handle('auth:login', async (_, { email, password }) => {
    const db = getDb()
    const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email)
    if (!user) return { error: 'invalid_credentials', message: 'Invalid email or password.' }
    if (!user.password_hash) return { error: 'no_password' }
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) return { error: 'invalid_credentials', message: 'Invalid email or password.' }
    db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id)
    const sessionUser = { id: user.id, name: user.name, email: user.email, role: user.role }
    logActivity({ userId: user.id, userName: user.name, userEmail: user.email, action: 'auth:login' })
    // Push updated last_login_at to Supabase
    syncWrite('users', 'upsert', { ...user, last_login_at: new Date().toISOString() })
    return { success: true, user: sessionUser }
  })

  // Step 2b: pending invited user — set password
  ipcMain.handle('auth:activateByEmail', async (_, { email, name, password }) => {
    const db = getDb()
    const user = db.prepare('SELECT * FROM users WHERE email = ? AND password_hash IS NULL AND is_active = 1').get(email)
    if (!user) return { error: 'not_eligible', message: 'This account cannot be activated this way.' }
    const hash = await bcrypt.hash(password, 12)
    db.prepare(`
      UPDATE users SET password_hash = ?, invite_token = NULL, invite_expires_at = NULL,
        name = COALESCE(NULLIF(?, ''), name), last_login_at = datetime('now')
      WHERE id = ?
    `).run(hash, name || '', user.id)
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)
    const sessionUser = { id: updated.id, name: updated.name, email: updated.email, role: updated.role }
    logActivity({ userId: updated.id, userName: updated.name, userEmail: updated.email, action: 'auth:activate' })
    syncWrite('users', 'upsert', updated)
    return { success: true, user: sessionUser }
  })

  // First-time owner password setup
  ipcMain.handle('auth:setOwnerPassword', async (_, { email, newPassword }) => {
    const db = getDb()
    const user = db.prepare("SELECT * FROM users WHERE email = ? AND role = 'owner' AND password_hash IS NULL AND is_active = 1").get(email)
    if (!user) return { error: 'not_eligible', message: 'Account not eligible for first-time setup.' }
    const hash = await bcrypt.hash(newPassword, 12)
    db.prepare("UPDATE users SET password_hash = ?, last_login_at = datetime('now') WHERE id = ?").run(hash, user.id)
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)
    const sessionUser = { id: updated.id, name: updated.name, email: updated.email, role: updated.role }
    logActivity({ userId: updated.id, userName: updated.name, userEmail: updated.email, action: 'auth:ownerSetup' })
    syncWrite('users', 'upsert', updated)
    return { success: true, user: sessionUser }
  })

  // Invite user — write to SQLite + push to Supabase
  ipcMain.handle('auth:inviteUser', async (_, { name, email, role }, session) => {
    if (!session || !['owner', 'admin'].includes(session.role)) return { error: 'forbidden' }
    const roleOrder = { owner: 4, admin: 3, editor: 2, viewer: 1 }
    if (roleOrder[role] >= roleOrder[session.role]) return { error: 'forbidden', message: 'Cannot assign a role equal to or higher than your own.' }
    const db = getDb()
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
    if (existing) {
      db.prepare('UPDATE users SET name = ?, role = ?, is_active = 1, created_by = ?, invite_token = NULL, invite_expires_at = NULL WHERE email = ?')
        .run(name, role, session.id, email)
    } else {
      db.prepare('INSERT INTO users (name, email, role, is_active, created_by) VALUES (?, ?, ?, 1, ?)')
        .run(name, email, role, session.id)
    }
    const user = db.prepare('SELECT id, name, email, role, is_active, created_by FROM users WHERE email = ?').get(email)
    logActivity({ userId: session.id, userName: session.name, userEmail: session.email, action: 'user:invite', entity: 'user', entityId: user.id, details: { email, role } })
    syncWrite('users', 'upsert', user)
    return { success: true, user }
  })

  ipcMain.handle('auth:getUsers', (_, session) => {
    if (!session || !['owner', 'admin'].includes(session.role)) return { error: 'forbidden' }
    return getDb().prepare('SELECT id, name, email, role, is_active, (password_hash IS NOT NULL) as has_password, created_at, last_login_at FROM users ORDER BY created_at ASC').all()
  })

  ipcMain.handle('auth:updateUser', (_, { id, name, role, is_active }, session) => {
    if (!session || !['owner', 'admin'].includes(session.role)) return { error: 'forbidden' }
    const db = getDb()
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
    if (!target) return { error: 'not_found' }
    if (target.role === 'owner' && session.role !== 'owner') return { error: 'forbidden', message: 'Cannot modify owner.' }
    const roleOrder = { owner: 4, admin: 3, editor: 2, viewer: 1 }
    if (role && roleOrder[role] >= roleOrder[session.role] && session.role !== 'owner') return { error: 'forbidden', message: 'Cannot assign this role.' }
    db.prepare('UPDATE users SET name = ?, role = ?, is_active = ? WHERE id = ?')
      .run(name || target.name, role || target.role, is_active !== undefined ? is_active : target.is_active, id)
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
    logActivity({ userId: session.id, userName: session.name, userEmail: session.email, action: 'user:update', entity: 'user', entityId: id, details: { role, is_active } })
    syncWrite('users', 'upsert', updated)
    return { success: true }
  })

  ipcMain.handle('auth:deleteUser', (_, { id }, session) => {
    if (!session || session.role !== 'owner') return { error: 'forbidden' }
    const db = getDb()
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
    if (!target || target.role === 'owner') return { error: 'forbidden', message: 'Cannot delete owner.' }
    if (target.id === session.id) return { error: 'forbidden', message: 'Cannot delete yourself.' }
    db.prepare('DELETE FROM users WHERE id = ?').run(id)
    logActivity({ userId: session.id, userName: session.name, userEmail: session.email, action: 'user:delete', entity: 'user', entityId: id })
    syncWrite('users', 'delete', { id })
    return { success: true }
  })

  ipcMain.handle('auth:changePassword', async (_, { currentPassword, newPassword }, session) => {
    if (!session) return { error: 'forbidden' }
    const db = getDb()
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.id)
    if (!user) return { error: 'not_found' }
    if (user.password_hash) {
      const valid = await bcrypt.compare(currentPassword, user.password_hash)
      if (!valid) return { error: 'invalid_credentials', message: 'Current password is incorrect.' }
    }
    const hash = await bcrypt.hash(newPassword, 12)
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, session.id)
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(session.id)
    logActivity({ userId: session.id, userName: session.name, userEmail: session.email, action: 'auth:changePassword' })
    syncWrite('users', 'upsert', updated)
    return { success: true }
  })

  ipcMain.handle('auth:resetUserPassword', async (_, { id, newPassword }, session) => {
    if (!session || session.role !== 'owner') return { error: 'forbidden' }
    const hash = await bcrypt.hash(newPassword, 12)
    getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id)
    const updated = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id)
    logActivity({ userId: session.id, userName: session.name, userEmail: session.email, action: 'user:resetPassword', entity: 'user', entityId: id })
    syncWrite('users', 'upsert', updated)
    return { success: true }
  })

  ipcMain.handle('auth:getActivity', (_, { limit = 50, offset = 0, user_id } = {}) => {
    const db = getDb()
    let query = 'SELECT * FROM activity_log'
    const params = []
    if (user_id) { query += ' WHERE user_id = ?'; params.push(user_id) }
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)
    return db.prepare(query).all(...params)
  })

  ipcMain.handle('auth:loadSession', () => loadSession())
  ipcMain.handle('auth:saveSession', (_, sessionData) => { saveSession(sessionData); return { success: true } })
  ipcMain.handle('auth:logout', (_, session) => {
    if (session) logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'auth:logout' })
    clearSession()
    return { success: true }
  })
}

// ─── FLOCKS ───────────────────────────────────────────────────────────────────

function registerFlockHandlers(ipcMain) {
  ipcMain.handle('flocks:getAll', () => {
    return getDb().prepare('SELECT * FROM flocks ORDER BY sort_order ASC, id ASC').all()
  })

  ipcMain.handle('flocks:add', (_, flock, session) => {
    const db = getDb()
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM flocks').get()
    const result = db.prepare(
      'INSERT INTO flocks (name, color, sort_order) VALUES (@name, @color, @sort_order)'
    ).run({ ...flock, sort_order: (maxOrder.m ?? -1) + 1 })
    const inserted = db.prepare('SELECT * FROM flocks WHERE id = ?').get(result.lastInsertRowid)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'flocks:add', entity: 'flock', entityId: result.lastInsertRowid })
    syncWrite('flocks', 'upsert', inserted)
    return { id: result.lastInsertRowid, ...flock }
  })

  ipcMain.handle('flocks:update', (_, id, flock, session) => {
    const db = getDb()
    db.prepare(
      `UPDATE flocks SET name=@name, color=@color, is_active=@is_active, initial_bird_count=@initial_bird_count,
       date_acquired=@date_acquired, breed=@breed, expected_lay_end=@expected_lay_end, target_yield_pct=@target_yield_pct,
       age_weeks_at_acquisition=@age_weeks_at_acquisition
       WHERE id=@id`
    ).run({ date_acquired: null, breed: null, expected_lay_end: null, target_yield_pct: 80, age_weeks_at_acquisition: null, ...flock, id })
    const updated = db.prepare('SELECT * FROM flocks WHERE id = ?').get(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'flocks:update', entity: 'flock', entityId: id })
    syncWrite('flocks', 'upsert', updated)
    return { id, ...flock }
  })

  ipcMain.handle('flocks:delete', (_, id, session) => {
    getDb().prepare('DELETE FROM flocks WHERE id = ?').run(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'flocks:delete', entity: 'flock', entityId: id })
    syncWrite('flocks', 'delete', { id })
    return { success: true }
  })
}

// ─── PRODUCTION ──────────────────────────────────────────────────────────────

function registerProductionHandlers(ipcMain) {
  ipcMain.handle('production:getAll', (_, monthYear) => {
    return getDb().prepare(`
      SELECT p.*, f.name AS flock_name, f.color AS flock_color
      FROM production p
      LEFT JOIN flocks f ON f.id = p.flock_id
      WHERE p.month_year = ?
      ORDER BY p.date ASC, p.flock_id ASC
    `).all(monthYear)
  })

  ipcMain.handle('production:add', (_, record, session) => {
    const db = getDb()
    if (record._opening_stock) {
      const { crates, pieces, flock_id } = record._opening_stock
      db.prepare(`
        INSERT INTO opening_stock (month_year, flock_id, crates, pieces)
        VALUES (@month_year, @flock_id, @crates, @pieces)
        ON CONFLICT(month_year, flock_id) DO UPDATE SET crates = excluded.crates, pieces = excluded.pieces
      `).run({ month_year: record.month_year, flock_id: flock_id || null, crates, pieces })
      return { success: true }
    }
    const { _opening_stock, ...clean } = record
    const result = db.prepare(`
      INSERT INTO production (date, month_year, flock_id, no_of_birds, crates, pieces)
      VALUES (@date, @month_year, @flock_id, @no_of_birds, @crates, @pieces)
    `).run(clean)
    const inserted = db.prepare('SELECT * FROM production WHERE id = ?').get(result.lastInsertRowid)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'production:add', entity: 'production', entityId: result.lastInsertRowid })
    syncWrite('production', 'upsert', inserted)
    return { id: result.lastInsertRowid, ...clean }
  })

  ipcMain.handle('production:update', (_, id, record, session) => {
    const db = getDb()
    db.prepare(`
      UPDATE production SET
        date = @date, flock_id = @flock_id,
        no_of_birds = @no_of_birds, crates = @crates, pieces = @pieces,
        updated_at = datetime('now')
      WHERE id = @id
    `).run({ ...record, id })
    const updated = db.prepare('SELECT * FROM production WHERE id = ?').get(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'production:update', entity: 'production', entityId: id })
    syncWrite('production', 'upsert', updated)
    return { id, ...record }
  })

  ipcMain.handle('production:delete', (_, id, session) => {
    getDb().prepare('DELETE FROM production WHERE id = ?').run(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'production:delete', entity: 'production', entityId: id })
    syncWrite('production', 'delete', { id })
    return { success: true }
  })

  ipcMain.handle('production:getSummary', (_, monthYear) => {
    const db = getDb()
    const byFlock = db.prepare(`
      SELECT p.flock_id, f.name AS flock_name, f.color AS flock_color,
        SUM(p.total_eggs) AS total_eggs,
        SUM(p.crates) AS total_crates,
        SUM(p.pieces) AS total_pieces,
        COUNT(DISTINCT p.date) AS days_recorded
      FROM production p
      LEFT JOIN flocks f ON f.id = p.flock_id
      WHERE p.month_year = ?
      GROUP BY p.flock_id
    `).all(monthYear)

    const opening = db.prepare(`
      SELECT o.*, f.name AS flock_name
      FROM opening_stock o
      LEFT JOIN flocks f ON f.id = o.flock_id
      WHERE o.month_year = ?
    `).all(monthYear)

    return { byFlock, opening }
  })

  ipcMain.handle('production:getOpening', (_, monthYear) => {
    return getDb().prepare(`
      SELECT o.*, f.name AS flock_name
      FROM opening_stock o
      LEFT JOIN flocks f ON f.id = o.flock_id
      WHERE o.month_year = ?
    `).all(monthYear)
  })
}

// ─── SALES ───────────────────────────────────────────────────────────────────

function registerSalesHandlers(ipcMain) {
  ipcMain.handle('sales:getAll', (_, monthYear) => {
    return getDb().prepare(`
      SELECT s.*, f.name AS flock_name, f.color AS flock_color,
        c.name AS credit_customer_name, c.phone AS credit_customer_phone,
        cs.status AS credit_status, cs.amount_paid AS credit_amount_paid,
        cs.amount_owed AS credit_amount_owed
      FROM sales s
      LEFT JOIN flocks f ON f.id = s.flock_id
      LEFT JOIN credit_customers c ON c.id = s.credit_customer_id
      LEFT JOIN credit_sales cs ON cs.id = s.credit_sale_id
      WHERE s.month_year = ?
      ORDER BY s.date ASC
    `).all(monthYear)
  })

  ipcMain.handle('sales:add', (_, record, session) => {
    const db = getDb()
    const isCredit = record.payment_status === 'credit'

    // Insert the sale record (explicit fields — never spread record to avoid unknown column errors)
    const saleResult = db.prepare(`
      INSERT INTO sales (date, month_year, egg_size, price_per_crate, flock_id, crates, pieces,
        payment_status, credit_customer_id, buyer_name)
      VALUES (@date, @month_year, @egg_size, @price_per_crate, @flock_id, @crates, @pieces,
        @payment_status, @credit_customer_id, @buyer_name)
    `).run({
      date: record.date,
      month_year: record.month_year,
      egg_size: record.egg_size,
      price_per_crate: record.price_per_crate,
      flock_id: record.flock_id,
      crates: record.crates,
      pieces: record.pieces,
      payment_status: record.payment_status || 'cash',
      credit_customer_id: isCredit ? (record.credit_customer_id || null) : null,
      buyer_name: record.buyer_name || null,
    })
    const saleId = saleResult.lastInsertRowid

    // Auto-create a credit_sale entry when payment is credit
    if (isCredit && record.credit_customer_id) {
      const deposit = record.amount_paid_now || 0
      const totalOwed = (record.crates + record.pieces / 30.0) * record.price_per_crate
      const csStatus = deposit <= 0 ? 'unpaid' : deposit >= totalOwed ? 'paid' : 'partial'
      const csResult = db.prepare(`
        INSERT INTO credit_sales
          (date, month_year, customer_id, egg_size, price_per_crate, crates, pieces, amount_paid, status, notes)
        VALUES (@date, @month_year, @customer_id, @egg_size, @price_per_crate, @crates, @pieces, @amount_paid, @status, @notes)
      `).run({
        date: record.date,
        month_year: record.month_year,
        customer_id: record.credit_customer_id,
        egg_size: record.egg_size,
        price_per_crate: record.price_per_crate,
        crates: record.crates,
        pieces: record.pieces,
        amount_paid: deposit,
        status: csStatus,
        notes: record.notes || null,
      })
      // Link back to the credit sale
      db.prepare('UPDATE sales SET credit_sale_id = ? WHERE id = ?').run(csResult.lastInsertRowid, saleId)
    }

    const inserted = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'sales:add', entity: 'sales', entityId: saleId })
    syncWrite('sales', 'upsert', inserted)
    return { id: saleId, ...record }
  })

  ipcMain.handle('sales:update', (_, id, record, session) => {
    const db = getDb()
    const isCredit = record.payment_status === 'credit'

    db.prepare(`
      UPDATE sales SET
        date = @date, egg_size = @egg_size, price_per_crate = @price_per_crate,
        flock_id = @flock_id, crates = @crates, pieces = @pieces,
        payment_status = @payment_status,
        credit_customer_id = @credit_customer_id,
        buyer_name = @buyer_name,
        updated_at = datetime('now')
      WHERE id = @id
    `).run({
      id,
      date: record.date,
      egg_size: record.egg_size,
      price_per_crate: record.price_per_crate,
      flock_id: record.flock_id,
      crates: record.crates,
      pieces: record.pieces,
      payment_status: record.payment_status || 'cash',
      credit_customer_id: isCredit ? (record.credit_customer_id || null) : null,
      buyer_name: record.buyer_name || null,
    })

    // Sync the linked credit_sale if it exists
    if (record.credit_sale_id) {
      db.prepare(`
        UPDATE credit_sales SET
          date=@date, month_year=@month_year, egg_size=@egg_size,
          price_per_crate=@price_per_crate, crates=@crates, pieces=@pieces,
          updated_at=datetime('now')
        WHERE id=@id
      `).run({
        id: record.credit_sale_id,
        date: record.date,
        month_year: record.month_year,
        egg_size: record.egg_size,
        price_per_crate: record.price_per_crate,
        crates: record.crates,
        pieces: record.pieces,
      })
      const updatedCs = db.prepare('SELECT * FROM credit_sales WHERE id = ?').get(record.credit_sale_id)
      if (updatedCs) syncWrite('credit_sales', 'upsert', updatedCs)
    }

    const updated = db.prepare('SELECT * FROM sales WHERE id = ?').get(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'sales:update', entity: 'sales', entityId: id })
    syncWrite('sales', 'upsert', updated)
    return { id, ...record }
  })

  ipcMain.handle('sales:delete', (_, id, session) => {
    const db = getDb()
    const sale = db.prepare('SELECT credit_sale_id FROM sales WHERE id = ?').get(id)
    db.prepare('DELETE FROM sales WHERE id = ?').run(id)
    if (sale?.credit_sale_id) {
      db.prepare('DELETE FROM credit_sales WHERE id = ?').run(sale.credit_sale_id)
      syncWrite('credit_sales', 'delete', { id: sale.credit_sale_id })
    }
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'sales:delete', entity: 'sales', entityId: id })
    syncWrite('sales', 'delete', { id })
    return { success: true }
  })

  ipcMain.handle('sales:getSummary', (_, monthYear) => {
    const db = getDb()
    const bySize = db.prepare(`
      SELECT egg_size,
        SUM(crates + pieces / 30.0) AS total_crates_equiv,
        SUM(total_revenue) AS total_revenue
      FROM sales WHERE month_year = ?
      GROUP BY egg_size
    `).all(monthYear)

    const byFlock = db.prepare(`
      SELECT s.flock_id, f.name AS flock_name,
        SUM(s.crates + s.pieces / 30.0) AS total_crates_equiv,
        SUM(s.total_revenue) AS total_revenue
      FROM sales s
      LEFT JOIN flocks f ON f.id = s.flock_id
      WHERE s.month_year = ?
      GROUP BY s.flock_id
    `).all(monthYear)

    const totals = db.prepare(`
      SELECT
        SUM(total_revenue) AS gross_revenue,
        SUM(crates) AS total_crates,
        SUM(pieces) AS total_pieces
      FROM sales WHERE month_year = ?
    `).get(monthYear)

    const cashReceived = getCashReceived(db, monthYear)

    return { bySize, byFlock, totals, cashReceived }
  })
}

// ─── DOMESTIC USAGE ───────────────────────────────────────────────────────────

function registerDomesticHandlers(ipcMain) {
  ipcMain.handle('domestic:getAll', (_, monthYear) => {
    return getDb().prepare(`
      SELECT d.*, f.name AS flock_name
      FROM domestic_usage d
      LEFT JOIN flocks f ON f.id = d.flock_id
      WHERE d.month_year = ?
      ORDER BY d.date ASC
    `).all(monthYear)
  })

  ipcMain.handle('domestic:add', (_, record, session) => {
    const db = getDb()
    const result = db.prepare(`
      INSERT INTO domestic_usage (date, month_year, location, crates, pieces, flock_id)
      VALUES (@date, @month_year, @location, @crates, @pieces, @flock_id)
    `).run(record)
    const inserted = db.prepare('SELECT * FROM domestic_usage WHERE id = ?').get(result.lastInsertRowid)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'domestic:add', entity: 'domestic', entityId: result.lastInsertRowid })
    syncWrite('domestic_usage', 'upsert', inserted)
    return { id: result.lastInsertRowid, ...record }
  })

  ipcMain.handle('domestic:update', (_, id, record, session) => {
    const db = getDb()
    db.prepare(`
      UPDATE domestic_usage SET
        date = @date, location = @location, crates = @crates,
        pieces = @pieces, flock_id = @flock_id,
        updated_at = datetime('now')
      WHERE id = @id
    `).run({ ...record, id })
    const updated = db.prepare('SELECT * FROM domestic_usage WHERE id = ?').get(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'domestic:update', entity: 'domestic', entityId: id })
    syncWrite('domestic_usage', 'upsert', updated)
    return { id, ...record }
  })

  ipcMain.handle('domestic:delete', (_, id, session) => {
    getDb().prepare('DELETE FROM domestic_usage WHERE id = ?').run(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'domestic:delete', entity: 'domestic', entityId: id })
    syncWrite('domestic_usage', 'delete', { id })
    return { success: true }
  })
}

// ─── EXPENSES ─────────────────────────────────────────────────────────────────

function registerExpensesHandlers(ipcMain) {
  ipcMain.handle('expenses:getAll', (_, monthYear) => {
    return getDb().prepare(
      'SELECT * FROM expenses WHERE month_year = ? ORDER BY date ASC'
    ).all(monthYear)
  })

  ipcMain.handle('expenses:add', (_, record, session) => {
    const db = getDb()
    const result = db.prepare(`
      INSERT INTO expenses (date, month_year, category, description, payment_method, amount, feed_type, quantity_kg, bags, supplier)
      VALUES (@date, @month_year, @category, @description, @payment_method, @amount, @feed_type, @quantity_kg, @bags, @supplier)
    `).run({ feed_type: null, quantity_kg: null, bags: null, supplier: null, ...record })
    const inserted = db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'expenses:add', entity: 'expenses', entityId: result.lastInsertRowid })
    syncWrite('expenses', 'upsert', inserted)
    return { id: result.lastInsertRowid, ...record }
  })

  ipcMain.handle('expenses:update', (_, id, record, session) => {
    const db = getDb()
    db.prepare(`
      UPDATE expenses SET
        date = @date, category = @category, description = @description,
        payment_method = @payment_method, amount = @amount,
        feed_type = @feed_type, quantity_kg = @quantity_kg, bags = @bags, supplier = @supplier,
        updated_at = datetime('now')
      WHERE id = @id
    `).run({ feed_type: null, quantity_kg: null, bags: null, supplier: null, ...record, id })
    const updated = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'expenses:update', entity: 'expenses', entityId: id })
    syncWrite('expenses', 'upsert', updated)
    return { id, ...record }
  })

  ipcMain.handle('expenses:delete', (_, id, session) => {
    getDb().prepare('DELETE FROM expenses WHERE id = ?').run(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'expenses:delete', entity: 'expenses', entityId: id })
    syncWrite('expenses', 'delete', { id })
    return { success: true }
  })

  ipcMain.handle('expenses:getSummary', (_, monthYear) => {
    const db = getDb()
    const byCategory = db.prepare(`
      SELECT category, SUM(amount) AS total
      FROM expenses WHERE month_year = ?
      GROUP BY category ORDER BY total DESC
    `).all(monthYear)

    const total = db.prepare(
      'SELECT SUM(amount) AS total_expenses FROM expenses WHERE month_year = ?'
    ).get(monthYear)

    return { byCategory, total }
  })
}

// ─── MONTHLY BALANCE ──────────────────────────────────────────────────────────

function registerBalanceInto(ipcMain) {
  ipcMain.handle('balance:get', (_, monthYear) => {
    return getDb().prepare(
      'SELECT * FROM monthly_balance WHERE month_year = ?'
    ).get(monthYear) || { month_year: monthYear, opening_balance: 0, notes: '' }
  })

  ipcMain.handle('balance:getAll', () => {
    return getDb().prepare(
      'SELECT * FROM monthly_balance ORDER BY month_year DESC'
    ).all()
  })

  ipcMain.handle('balance:upsert', (_, { month_year, opening_balance, notes }) => {
    const db = getDb()
    db.prepare(`
      INSERT INTO monthly_balance (month_year, opening_balance, notes, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(month_year) DO UPDATE SET
        opening_balance = excluded.opening_balance,
        notes = excluded.notes,
        updated_at = excluded.updated_at
    `).run(month_year, opening_balance, notes || null)
    const row = db.prepare('SELECT * FROM monthly_balance WHERE month_year = ?').get(month_year)
    syncWrite('monthly_balance', 'upsert', row)
    return { success: true }
  })

  ipcMain.handle('balance:rollover', (_, { from_month, to_month }) => {
    const db = getDb()
    const fromBalance = db.prepare(
      'SELECT opening_balance FROM monthly_balance WHERE month_year = ?'
    ).get(from_month)
    const cashReceived = getCashReceived(db, from_month)
    const expenses = db.prepare(
      'SELECT COALESCE(SUM(amount),0) AS v FROM expenses WHERE month_year = ?'
    ).get(from_month)

    const closingBalance = (fromBalance?.opening_balance || 0) + cashReceived - expenses.v

    db.prepare(`
      INSERT INTO monthly_balance (month_year, opening_balance, notes, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(month_year) DO UPDATE SET
        opening_balance = excluded.opening_balance,
        notes = excluded.notes,
        updated_at = excluded.updated_at
    `).run(to_month, closingBalance, `Rolled over from ${from_month}`)
    const row = db.prepare('SELECT * FROM monthly_balance WHERE month_year = ?').get(to_month)
    syncWrite('monthly_balance', 'upsert', row)
    return { success: true, closingBalance }
  })

  // Auto-load: if month_year has no opening balance row, compute it from the previous month
  // and persist it. Safe to call every time the app loads a month.
  ipcMain.handle('balance:autoLoad', (_, monthYear) => {
    const db = getDb()
    const existing = db.prepare(
      'SELECT opening_balance FROM monthly_balance WHERE month_year = ?'
    ).get(monthYear)

    if (existing) return { opening_balance: existing.opening_balance, source: 'stored' }

    // Compute previous month
    const [year, month] = monthYear.split('-').map(Number)
    const prevDate = new Date(year, month - 2, 1) // month-1 is current, month-2 is previous
    const prevMonthYear = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`

    const prevBalance = db.prepare(
      'SELECT opening_balance FROM monthly_balance WHERE month_year = ?'
    ).get(prevMonthYear)
    const prevCashReceived = getCashReceived(db, prevMonthYear)
    const expenses = db.prepare(
      'SELECT COALESCE(SUM(amount),0) AS v FROM expenses WHERE month_year = ?'
    ).get(prevMonthYear)

    const derivedOpening = (prevBalance?.opening_balance || 0) + prevCashReceived - (expenses?.v || 0)

    db.prepare(`
      INSERT INTO monthly_balance (month_year, opening_balance, notes, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(month_year) DO NOTHING
    `).run(monthYear, derivedOpening, `Auto-derived from ${prevMonthYear}`)

    return { opening_balance: derivedOpening, source: 'auto' }
  })
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

function registerSettingsHandlers(ipcMain) {
  ipcMain.handle('settings:get', () => {
    const rows = getDb().prepare('SELECT key, value FROM settings').all()
    return Object.fromEntries(rows.map(r => [r.key, r.value]))
  })

  ipcMain.handle('settings:update', (_, settings) => {
    const db = getDb()
    const upsert = db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `)
    const tx = db.transaction((data) => {
      Object.entries(data).forEach(([k, v]) => upsert.run(k, String(v)))
    })
    tx(settings)
    Object.entries(settings).forEach(([key, value]) => syncWrite('settings', 'upsert', { key, value }))
    return { success: true }
  })

  ipcMain.handle('settings:getPrices', () => {
    return getDb().prepare('SELECT * FROM egg_prices ORDER BY sort_order ASC, id ASC').all()
  })

  ipcMain.handle('settings:addPrice', (_, { size, price_per_crate }) => {
    const db = getDb()
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM egg_prices').get()
    const result = db.prepare(
      'INSERT INTO egg_prices (size, price_per_crate, sort_order) VALUES (?, ?, ?)'
    ).run(size, price_per_crate, (maxOrder.m ?? -1) + 1)
    return { id: result.lastInsertRowid, size, price_per_crate }
  })

  ipcMain.handle('settings:updatePrice', (_, id, { size, price_per_crate }) => {
    getDb().prepare(
      'UPDATE egg_prices SET size = ?, price_per_crate = ?, updated_at = datetime("now") WHERE id = ?'
    ).run(size, price_per_crate, id)
    return { success: true }
  })

  ipcMain.handle('settings:deletePrice', (_, id) => {
    getDb().prepare('DELETE FROM egg_prices WHERE id = ?').run(id)
    return { success: true }
  })
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

function registerDashboardHandlers(ipcMain) {
  ipcMain.handle('dashboard:getSummary', (_, monthYear) => {
    const db = getDb()

    const openingRows = db.prepare(
      'SELECT SUM(crates * 30 + pieces) AS total FROM opening_stock WHERE month_year = ?'
    ).get(monthYear)
    const openingEggs = openingRows?.total || 0

    const production = db.prepare(
      'SELECT SUM(total_eggs) AS total_produced FROM production WHERE month_year = ?'
    ).get(monthYear)

    const salesTotal = db.prepare(`
      SELECT
        SUM(crates * 30 + pieces) AS total_eggs_sold,
        SUM(total_revenue) AS gross_revenue,
        SUM(crates) AS total_crates_sold
      FROM sales WHERE month_year = ?
    `).get(monthYear)

    const domesticTotal = db.prepare(
      'SELECT SUM(crates * 30 + pieces) AS total FROM domestic_usage WHERE month_year = ?'
    ).get(monthYear)

    const expensesTotal = db.prepare(
      'SELECT SUM(amount) AS total_expenses FROM expenses WHERE month_year = ?'
    ).get(monthYear)

    const openingBalanceRow = db.prepare(
      'SELECT opening_balance FROM monthly_balance WHERE month_year = ?'
    ).get(monthYear)
    const openingBalance = openingBalanceRow?.opening_balance || 0

    const totalProduced = production?.total_produced || 0
    const totalStock = totalProduced + openingEggs
    const totalOutflow = (salesTotal?.total_eggs_sold || 0) + (domesticTotal?.total || 0)
    const closingStockEggs = Math.max(totalStock - totalOutflow, 0)
    const grossRevenue = salesTotal?.gross_revenue || 0
    const totalExpenses = expensesTotal?.total_expenses || 0
    const cashReceived = getCashReceived(db, monthYear)
    const closingBalance = openingBalance + cashReceived - totalExpenses

    const bestSize = db.prepare(`
      SELECT egg_size, SUM(total_revenue) AS rev
      FROM sales WHERE month_year = ?
      GROUP BY egg_size ORDER BY rev DESC LIMIT 1
    `).get(monthYear)

    const avgCratePrice = salesTotal?.total_crates_sold > 0
      ? grossRevenue / salesTotal.total_crates_sold
      : 0

    const dailyProduction = db.prepare(`
      SELECT p.date,
        SUM(p.total_eggs) AS total,
        f.name AS flock_name,
        p.flock_id
      FROM production p
      LEFT JOIN flocks f ON f.id = p.flock_id
      WHERE p.month_year = ?
      GROUP BY p.date, p.flock_id
      ORDER BY p.date ASC
    `).all(monthYear)

    // Build per-day totals and per-flock breakdown
    const dailyMap = {}
    dailyProduction.forEach(r => {
      if (!dailyMap[r.date]) dailyMap[r.date] = { date: r.date, total: 0, flocks: {} }
      dailyMap[r.date].total += r.total
      dailyMap[r.date].flocks[r.flock_id] = r.total
    })
    const dailyData = Object.values(dailyMap)

    // Legacy L1/L2 fields for dashboard chart (first two flocks)
    const flocks = db.prepare('SELECT * FROM flocks ORDER BY sort_order ASC LIMIT 2').all()
    const f1id = flocks[0]?.id
    const f2id = flocks[1]?.id
    const dailyProductionLegacy = dailyData.map(d => ({
      date: d.date,
      total: d.total,
      l1: d.flocks[f1id] || 0,
      l2: d.flocks[f2id] || 0,
    }))

    return {
      opening: { totalEggs: openingEggs },
      totalProduced,
      totalStock,
      totalOutflow,
      closingStockEggs,
      closingStockCrates: Math.floor(closingStockEggs / 30),
      closingStockPieces: closingStockEggs % 30,
      grossRevenue,
      cashReceived,
      openingBalance,
      totalCashIn: openingBalance + cashReceived,
      totalExpenses,
      closingBalance,
      bestSellingSize: bestSize?.egg_size || '—',
      avgCratePrice,
      dailyProduction: dailyProductionLegacy,
      flocks,
    }
  })

  ipcMain.handle('dashboard:getMonths', () => {
    const db = getDb()
    const months = [
      ...db.prepare('SELECT DISTINCT month_year FROM production').all(),
      ...db.prepare('SELECT DISTINCT month_year FROM sales').all(),
      ...db.prepare('SELECT DISTINCT month_year FROM expenses').all(),
    ].map(r => r.month_year)
    return [...new Set(months)].sort().reverse()
  })
}

// ─── FLOCK MOVEMENTS ──────────────────────────────────────────────────────────

function registerMortalityHandlers(ipcMain) {
  ipcMain.handle('mortality:getAll', (_, monthYear) => {
    return getDb().prepare(`
      SELECT m.*, f.name AS flock_name, f.color AS flock_color
      FROM flock_movements m
      LEFT JOIN flocks f ON f.id = m.flock_id
      WHERE m.month_year = ?
      ORDER BY m.date ASC
    `).all(monthYear)
  })

  ipcMain.handle('mortality:add', (_, record, session) => {
    const db = getDb()
    const result = db.prepare(`
      INSERT INTO flock_movements (date, month_year, flock_id, count, reason, notes)
      VALUES (@date, @month_year, @flock_id, @count, @reason, @notes)
    `).run(record)
    const inserted = db.prepare('SELECT * FROM flock_movements WHERE id = ?').get(result.lastInsertRowid)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'mortality:add', entity: 'flock_movement', entityId: result.lastInsertRowid })
    syncWrite('flock_movements', 'upsert', inserted)
    return { id: result.lastInsertRowid, ...record }
  })

  ipcMain.handle('mortality:update', (_, id, record, session) => {
    const db = getDb()
    db.prepare(`
      UPDATE flock_movements SET date=@date, flock_id=@flock_id, count=@count,
        reason=@reason, notes=@notes, updated_at=datetime('now')
      WHERE id=@id
    `).run({ ...record, id })
    const updated = db.prepare('SELECT * FROM flock_movements WHERE id = ?').get(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'mortality:update', entity: 'flock_movement', entityId: id })
    syncWrite('flock_movements', 'upsert', updated)
    return { id, ...record }
  })

  ipcMain.handle('mortality:delete', (_, id, session) => {
    getDb().prepare('DELETE FROM flock_movements WHERE id=?').run(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'mortality:delete', entity: 'flock_movement', entityId: id })
    syncWrite('flock_movements', 'delete', { id })
    return { success: true }
  })

  ipcMain.handle('mortality:getRange', (_, { from, to }) => {
    return getDb().prepare(`
      SELECT m.*, f.name AS flock_name
      FROM flock_movements m
      LEFT JOIN flocks f ON f.id = m.flock_id
      WHERE m.date >= ? AND m.date <= ?
      ORDER BY m.date ASC, m.flock_id ASC
    `).all(from, to)
  })

  ipcMain.handle('mortality:getSummary', (_, monthYear) => {
    const db = getDb()

    const byFlock = db.prepare(`
      SELECT m.flock_id, f.name AS flock_name, f.color AS flock_color,
        SUM(m.count) AS total_removed,
        f.initial_bird_count,
        (SELECT SUM(m2.count) FROM flock_movements m2 WHERE m2.flock_id = m.flock_id AND m2.month_year <= ?) AS cumulative_removed
      FROM flock_movements m
      LEFT JOIN flocks f ON f.id = m.flock_id
      WHERE m.month_year = ?
      GROUP BY m.flock_id
    `).all(monthYear, monthYear)

    const byReason = db.prepare(`
      SELECT reason, SUM(count) AS total
      FROM flock_movements WHERE month_year = ?
      GROUP BY reason ORDER BY total DESC
    `).all(monthYear)

    const totalThisMonth = db.prepare(
      'SELECT SUM(count) AS total FROM flock_movements WHERE month_year = ?'
    ).get(monthYear)

    // Live bird count per flock = initial_bird_count - all cumulative removals
    const flockBirdCounts = db.prepare(`
      SELECT f.id, f.name, f.color, f.initial_bird_count, f.date_acquired, f.age_weeks_at_acquisition,
        COALESCE((SELECT SUM(m.count) FROM flock_movements m WHERE m.flock_id = f.id), 0) AS total_removed
      FROM flocks f WHERE f.is_active = 1
    `).all()

    return { byFlock, byReason, totalThisMonth: totalThisMonth?.total || 0, flockBirdCounts }
  })
}

// ─── FEED LOG ─────────────────────────────────────────────────────────────────

function registerFeedHandlers(ipcMain) {
  ipcMain.handle('feed:getAll', (_, monthYear) => {
    return getDb().prepare(`
      SELECT f.*, fk.name AS flock_name, fk.color AS flock_color
      FROM feed_log f
      LEFT JOIN flocks fk ON fk.id = f.flock_id
      WHERE f.month_year = ?
      ORDER BY f.date ASC
    `).all(monthYear)
  })

  ipcMain.handle('feed:add', (_, record, session) => {
    const db = getDb()
    const result = db.prepare(`
      INSERT INTO feed_log (date, month_year, flock_id, feed_type, quantity_kg, notes)
      VALUES (@date, @month_year, @flock_id, @feed_type, @quantity_kg, @notes)
    `).run(record)
    const inserted = db.prepare('SELECT * FROM feed_log WHERE id = ?').get(result.lastInsertRowid)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'feed:add', entity: 'feed', entityId: result.lastInsertRowid })
    syncWrite('feed_log', 'upsert', inserted)
    return { id: result.lastInsertRowid, ...record }
  })

  ipcMain.handle('feed:update', (_, id, record, session) => {
    const db = getDb()
    db.prepare(`
      UPDATE feed_log SET date=@date, flock_id=@flock_id, feed_type=@feed_type,
        quantity_kg=@quantity_kg, notes=@notes, updated_at=datetime('now')
      WHERE id=@id
    `).run({ ...record, id })
    const updated = db.prepare('SELECT * FROM feed_log WHERE id = ?').get(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'feed:update', entity: 'feed', entityId: id })
    syncWrite('feed_log', 'upsert', updated)
    return { id, ...record }
  })

  ipcMain.handle('feed:delete', (_, id, session) => {
    getDb().prepare('DELETE FROM feed_log WHERE id=?').run(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'feed:delete', entity: 'feed', entityId: id })
    syncWrite('feed_log', 'delete', { id })
    return { success: true }
  })

  ipcMain.handle('feed:getStock', () => {
    const db = getDb()

    const bagKgRow = db.prepare("SELECT value FROM settings WHERE key='feed_bag_kg'").get()
    const bagKg = bagKgRow ? (Number(bagKgRow.value) || 25) : 25

    // Use quantity_kg if set, otherwise fall back to bags * bagKg
    const purchased = db.prepare(`
      SELECT COALESCE(SUM(
        CASE WHEN quantity_kg IS NOT NULL AND quantity_kg > 0 THEN quantity_kg
             WHEN bags IS NOT NULL AND bags > 0 THEN bags * ?
             ELSE 0 END
      ), 0) AS total_kg
      FROM expenses WHERE category='Feed'
    `).get(bagKg)

    const consumed = db.prepare(
      'SELECT COALESCE(SUM(quantity_kg),0) AS total_kg FROM feed_log'
    ).get()

    const stockOnHandKg = Math.max((purchased.total_kg || 0) - (consumed.total_kg || 0), 0)

    const purchasedByType = db.prepare(`
      SELECT feed_type,
        COALESCE(SUM(
          CASE WHEN quantity_kg IS NOT NULL AND quantity_kg > 0 THEN quantity_kg
               WHEN bags IS NOT NULL AND bags > 0 THEN bags * ?
               ELSE 0 END
        ), 0) AS kg
      FROM expenses
      WHERE category='Feed' AND feed_type IS NOT NULL
      GROUP BY feed_type
    `).all(bagKg)
    const consumedByType = db.prepare(
      'SELECT feed_type, COALESCE(SUM(quantity_kg),0) AS kg FROM feed_log GROUP BY feed_type'
    ).all()
    const consumedMap = Object.fromEntries(consumedByType.map(r => [r.feed_type, r.kg]))
    const byType = purchasedByType.map(r => ({
      feed_type: r.feed_type,
      purchased_kg: r.kg,
      consumed_kg: consumedMap[r.feed_type] || 0,
      stock_kg: Math.max(r.kg - (consumedMap[r.feed_type] || 0), 0),
    }))

    return {
      stockOnHandKg,
      totalPurchasedKg: purchased.total_kg,
      totalConsumedKg: consumed.total_kg,
      byType,
    }
  })

  ipcMain.handle('feed:getRange', (_, { from, to }) => {
    return getDb().prepare(`
      SELECT f.*, fk.name AS flock_name, fk.color AS flock_color
      FROM feed_log f
      LEFT JOIN flocks fk ON fk.id = f.flock_id
      WHERE f.date >= ? AND f.date <= ?
      ORDER BY f.date ASC, f.flock_id ASC
    `).all(from, to)
  })

  ipcMain.handle('feed:getSummary', (_, monthYear) => {
    const db = getDb()
    const totals = db.prepare(
      'SELECT COALESCE(SUM(quantity_kg),0) AS total_kg FROM feed_log WHERE month_year = ?'
    ).get(monthYear)

    const byType = db.prepare(`
      SELECT feed_type, COALESCE(SUM(quantity_kg),0) AS total_kg
      FROM feed_log WHERE month_year = ?
      GROUP BY feed_type ORDER BY total_kg DESC
    `).all(monthYear)

    const byFlock = db.prepare(`
      SELECT f.flock_id, fk.name AS flock_name, fk.color AS flock_color,
        COALESCE(SUM(f.quantity_kg),0) AS total_kg
      FROM feed_log f
      LEFT JOIN flocks fk ON fk.id = f.flock_id
      WHERE f.month_year = ?
      GROUP BY f.flock_id
    `).all(monthYear)

    // Feed purchases this month (from expenses)
    const purchased = db.prepare(
      "SELECT COALESCE(SUM(quantity_kg),0) AS total_kg, COALESCE(SUM(amount),0) AS total_cost FROM expenses WHERE category='Feed' AND month_year=? AND quantity_kg IS NOT NULL AND quantity_kg > 0"
    ).get(monthYear)

    return { totals, byType, byFlock, purchased }
  })
}

// ─── WATER LOG ────────────────────────────────────────────────────────────────

function registerWaterHandlers(ipcMain) {
  ipcMain.handle('water:getAll', (_, monthYear) => {
    return getDb().prepare(`
      SELECT w.*, f.name AS flock_name, f.color AS flock_color
      FROM water_log w
      LEFT JOIN flocks f ON f.id = w.flock_id
      WHERE w.month_year = ?
      ORDER BY w.date ASC
    `).all(monthYear)
  })

  ipcMain.handle('water:add', (_, record, session) => {
    const db = getDb()
    const result = db.prepare(`
      INSERT INTO water_log (date, month_year, flock_id, litres, notes)
      VALUES (@date, @month_year, @flock_id, @litres, @notes)
    `).run(record)
    const inserted = db.prepare('SELECT * FROM water_log WHERE id = ?').get(result.lastInsertRowid)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'water:add', entity: 'water', entityId: result.lastInsertRowid })
    syncWrite('water_log', 'upsert', inserted)
    return { id: result.lastInsertRowid, ...record }
  })

  ipcMain.handle('water:update', (_, id, record, session) => {
    const db = getDb()
    db.prepare(`
      UPDATE water_log SET date=@date, flock_id=@flock_id, litres=@litres,
        notes=@notes, updated_at=datetime('now')
      WHERE id=@id
    `).run({ ...record, id })
    const updated = db.prepare('SELECT * FROM water_log WHERE id = ?').get(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'water:update', entity: 'water', entityId: id })
    syncWrite('water_log', 'upsert', updated)
    return { id, ...record }
  })

  ipcMain.handle('water:delete', (_, id, session) => {
    getDb().prepare('DELETE FROM water_log WHERE id=?').run(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'water:delete', entity: 'water', entityId: id })
    syncWrite('water_log', 'delete', { id })
    return { success: true }
  })

  ipcMain.handle('water:getSummary', (_, monthYear) => {
    const db = getDb()
    const total = db.prepare(
      'SELECT COALESCE(SUM(litres),0) AS total FROM water_log WHERE month_year = ?'
    ).get(monthYear)
    const byFlock = db.prepare(`
      SELECT w.flock_id, f.name AS flock_name, f.color AS flock_color,
        COALESCE(SUM(w.litres),0) AS total_litres
      FROM water_log w
      LEFT JOIN flocks f ON f.id = w.flock_id
      WHERE w.month_year = ?
      GROUP BY w.flock_id
    `).all(monthYear)
    return { total: total.total, byFlock }
  })

  // Range query used by the Poultry Control Record report
  ipcMain.handle('water:getRange', (_, { from, to }) => {
    return getDb().prepare(`
      SELECT w.*, f.name AS flock_name, f.color AS flock_color
      FROM water_log w
      LEFT JOIN flocks f ON f.id = w.flock_id
      WHERE w.date >= ? AND w.date <= ?
      ORDER BY w.date ASC, w.flock_id ASC
    `).all(from, to)
  })
}

// ─── HEALTH RECORDS ───────────────────────────────────────────────────────────

function registerHealthHandlers(ipcMain) {
  ipcMain.handle('health:getAll', (_, monthYear) => {
    return getDb().prepare(`
      SELECT h.*, f.name AS flock_name, f.color AS flock_color
      FROM health_records h
      LEFT JOIN flocks f ON f.id = h.flock_id
      WHERE h.month_year = ?
      ORDER BY h.date ASC
    `).all(monthYear)
  })

  ipcMain.handle('health:getUpcoming', () => {
    return getDb().prepare(`
      SELECT h.*, f.name AS flock_name, f.color AS flock_color
      FROM health_records h
      LEFT JOIN flocks f ON f.id = h.flock_id
      WHERE h.next_due_date IS NOT NULL AND h.next_due_date >= date('now')
      ORDER BY h.next_due_date ASC
      LIMIT 10
    `).all()
  })

  ipcMain.handle('health:add', (_, record, session) => {
    const db = getDb()
    const result = db.prepare(`
      INSERT INTO health_records
        (date, month_year, flock_id, record_type, name, dosage, administered_by, cost, next_due_date, notes)
      VALUES
        (@date, @month_year, @flock_id, @record_type, @name, @dosage, @administered_by, @cost, @next_due_date, @notes)
    `).run(record)
    const inserted = db.prepare('SELECT * FROM health_records WHERE id = ?').get(result.lastInsertRowid)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'health:add', entity: 'health', entityId: result.lastInsertRowid })
    syncWrite('health_records', 'upsert', inserted)
    return { id: result.lastInsertRowid, ...record }
  })

  ipcMain.handle('health:update', (_, id, record, session) => {
    const db = getDb()
    db.prepare(`
      UPDATE health_records SET date=@date, flock_id=@flock_id, record_type=@record_type,
        name=@name, dosage=@dosage, administered_by=@administered_by, cost=@cost,
        next_due_date=@next_due_date, notes=@notes, updated_at=datetime('now')
      WHERE id=@id
    `).run({ ...record, id })
    const updated = db.prepare('SELECT * FROM health_records WHERE id = ?').get(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'health:update', entity: 'health', entityId: id })
    syncWrite('health_records', 'upsert', updated)
    return { id, ...record }
  })

  ipcMain.handle('health:delete', (_, id, session) => {
    getDb().prepare('DELETE FROM health_records WHERE id=?').run(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'health:delete', entity: 'health', entityId: id })
    syncWrite('health_records', 'delete', { id })
    return { success: true }
  })

  ipcMain.handle('health:getRange', (_, { from, to }) => {
    return getDb().prepare(`
      SELECT h.*, f.name AS flock_name
      FROM health_records h
      LEFT JOIN flocks f ON f.id = h.flock_id
      WHERE h.date >= ? AND h.date <= ?
      ORDER BY h.date ASC, h.flock_id ASC
    `).all(from, to)
  })

  ipcMain.handle('health:getSummary', (_, monthYear) => {
    const db = getDb()
    const totalCost = db.prepare(
      'SELECT SUM(cost) AS total FROM health_records WHERE month_year = ?'
    ).get(monthYear)

    const byType = db.prepare(`
      SELECT record_type, COUNT(*) AS count, SUM(cost) AS total_cost
      FROM health_records WHERE month_year = ?
      GROUP BY record_type
    `).all(monthYear)

    return { totalCost: totalCost?.total || 0, byType }
  })
}

// ─── AI CHAT ──────────────────────────────────────────────────────────────────

async function callGemini(apiKey, systemPrompt, messages) {
  const contents = messages.length === 1
    ? [{ role: 'user', parts: [{ text: systemPrompt + '\n\nUser: ' + messages[0].content }] }]
    : [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Understood. I have full access to all farm records across every month. How can I help?' }] },
        ...messages.map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }],
        }))
      ]

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents }) }
  )

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    const status = response.status
    const msg = err?.error?.message || `Gemini API error: ${status}`
    const retryable = status === 429 || status === 503 || (msg && (msg.includes('overloaded') || msg.includes('high demand') || msg.includes('quota')))
    return { error: true, retryable, message: msg }
  }

  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) return { error: true, retryable: false, message: 'No response from Gemini.' }
  return { success: true, reply: text, model: 'Gemini' }
}

async function callOpenAI(apiKey, systemPrompt, messages) {
  const chatMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))
  ]

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: chatMessages, max_tokens: 1024 })
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    const status = response.status
    const msg = err?.error?.message || `OpenAI API error: ${status}`
    const retryable = status === 429 || status === 503
    return { error: true, retryable, message: msg }
  }

  const data = await response.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) return { error: true, retryable: false, message: 'No response from OpenAI.' }
  return { success: true, reply: text, model: 'OpenAI' }
}

function registerAIHandlers(ipcMain) {
  ipcMain.handle('ai:chat', async (_, { messages }) => {
    const db = getDb()

    const geminiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get()
    const openaiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'openai_api_key'").get()
    const modelPrefRow = db.prepare("SELECT value FROM settings WHERE key = 'ai_model'").get()
    const geminiKey = geminiKeyRow?.value?.trim() || ''
    const openaiKey = openaiKeyRow?.value?.trim() || ''
    const modelPref = modelPrefRow?.value || 'auto'

    if (!geminiKey && !openaiKey) {
      return { error: 'no_key', message: 'No API key configured. Go to Settings → AI Assistant to add a Gemini or OpenAI key.' }
    }

    // ── All-time data ──────────────────────────────────────────────
    const flocks = db.prepare(
      'SELECT id, name, initial_bird_count, breed, is_active, date_acquired, expected_lay_end FROM flocks'
    ).all()

    // Monthly summaries for production, sales, expenses
    const productionByMonth = db.prepare(`
      SELECT p.month_year,
        f.name AS flock,
        SUM(p.total_eggs) AS total_eggs,
        SUM(p.crates) AS crates,
        SUM(p.pieces) AS pieces
      FROM production p LEFT JOIN flocks f ON f.id = p.flock_id
      GROUP BY p.month_year, p.flock_id
      ORDER BY p.month_year ASC
    `).all()

    const salesByMonth = db.prepare(`
      SELECT s.month_year,
        f.name AS flock,
        s.egg_size,
        SUM(s.crates) AS crates,
        SUM(s.pieces) AS pieces,
        SUM(s.total_revenue) AS revenue
      FROM sales s LEFT JOIN flocks f ON f.id = s.flock_id
      GROUP BY s.month_year, s.flock_id, s.egg_size
      ORDER BY s.month_year ASC
    `).all()

    const expensesByMonth = db.prepare(`
      SELECT month_year, category, SUM(amount) AS total
      FROM expenses
      GROUP BY month_year, category
      ORDER BY month_year ASC
    `).all()

    const mortalityByMonth = db.prepare(`
      SELECT m.month_year, f.name AS flock, m.reason, SUM(m.count) AS total
      FROM flock_movements m LEFT JOIN flocks f ON f.id = m.flock_id
      GROUP BY m.month_year, m.flock_id, m.reason
      ORDER BY m.month_year ASC
    `).all()

    const feedByMonth = db.prepare(`
      SELECT f.month_year, fk.name AS flock, f.feed_type,
        SUM(f.quantity_kg) AS total_kg
      FROM feed_log f LEFT JOIN flocks fk ON fk.id = f.flock_id
      GROUP BY f.month_year, f.flock_id, f.feed_type
      ORDER BY f.month_year ASC
    `).all()

    const healthAll = db.prepare(`
      SELECT h.date, h.month_year, f.name AS flock, h.record_type,
        h.name AS treatment, h.cost, h.next_due_date, h.notes
      FROM health_records h LEFT JOIN flocks f ON f.id = h.flock_id
      ORDER BY h.date ASC
    `).all()

    const balanceAll = db.prepare(
      'SELECT month_year, opening_balance FROM monthly_balance ORDER BY month_year ASC'
    ).all()

    // All-time totals
    const allTimeSales = db.prepare('SELECT COALESCE(SUM(total_revenue),0) AS v FROM sales').get()
    const allTimeExpenses = db.prepare('SELECT COALESCE(SUM(amount),0) AS v FROM expenses').get()
    const allTimeEggs = db.prepare('SELECT COALESCE(SUM(total_eggs),0) AS v FROM production').get()
    const allTimeMortality = db.prepare('SELECT COALESCE(SUM(count),0) AS v FROM flock_movements').get()

    const systemPrompt = `You are a smart farm management assistant for Eldesign Poultry Farm. You have full access to ALL historical farm records — every month since the business started — and can answer questions about any time period.

Today's date: ${new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

=== FLOCKS ===
${JSON.stringify(flocks, null, 2)}

=== ALL-TIME TOTALS ===
Total eggs produced: ${allTimeEggs.v.toLocaleString()}
Total revenue: ₦${allTimeSales.v.toLocaleString()}
Total expenses: ₦${allTimeExpenses.v.toLocaleString()}
Total net profit: ₦${(allTimeSales.v - allTimeExpenses.v).toLocaleString()}
Total bird removals/mortality: ${allTimeMortality.v}

=== PRODUCTION BY MONTH (per flock) ===
${JSON.stringify(productionByMonth, null, 2)}

=== SALES BY MONTH (per flock & egg size) ===
${JSON.stringify(salesByMonth, null, 2)}

=== EXPENSES BY MONTH (per category) ===
${JSON.stringify(expensesByMonth, null, 2)}

=== FLOCK MOVEMENTS / MORTALITY BY MONTH ===
${JSON.stringify(mortalityByMonth, null, 2)}

=== FEED BY MONTH ===
${JSON.stringify(feedByMonth, null, 2)}

=== HEALTH RECORDS (all time) ===
${JSON.stringify(healthAll, null, 2)}

=== MONTHLY BALANCES ===
${JSON.stringify(balanceAll, null, 2)}

Answer questions clearly and concisely. Use ₦ for currency. You can compare months, identify trends, and answer questions about any period. Be specific with numbers. Give practical advice when asked.

Formatting rules:
- Use **bold** for key figures, month names, and important labels
- Use bullet points (- item) for lists and numbered lists (1. item) for steps
- Keep responses focused and scannable
- Do NOT use headers (### or ## or #)
- Do NOT use horizontal rules (--- or ***)
- Do NOT use tables`

    // Determine call order based on preference
    const useGeminiFirst = modelPref === 'gemini' || (modelPref === 'auto' && !!geminiKey)
    const useOpenAIFirst = modelPref === 'openai' || (modelPref === 'auto' && !geminiKey && !!openaiKey)

    try {
      if (useGeminiFirst && geminiKey) {
        const result = await callGemini(geminiKey, systemPrompt, messages)
        if (result.success) return { success: true, reply: result.reply, model: 'Gemini' }
        // Fall back to OpenAI if retryable (rate-limited/overloaded) and key exists
        if (result.retryable && openaiKey && modelPref !== 'gemini') {
          const fallback = await callOpenAI(openaiKey, systemPrompt, messages)
          if (fallback.success) return { success: true, reply: fallback.reply, model: 'OpenAI (fallback)' }
          return { error: 'api_error', message: `Gemini: ${result.message} · OpenAI: ${fallback.message}` }
        }
        return { error: 'api_error', message: result.message }
      }

      if ((useOpenAIFirst || modelPref === 'openai') && openaiKey) {
        const result = await callOpenAI(openaiKey, systemPrompt, messages)
        if (result.success) return { success: true, reply: result.reply, model: 'OpenAI' }
        if (result.retryable && geminiKey && modelPref !== 'openai') {
          const fallback = await callGemini(geminiKey, systemPrompt, messages)
          if (fallback.success) return { success: true, reply: fallback.reply, model: 'Gemini (fallback)' }
          return { error: 'api_error', message: `OpenAI: ${result.message} · Gemini: ${fallback.message}` }
        }
        return { error: 'api_error', message: result.message }
      }

      return { error: 'no_key', message: 'No API key available for the selected model.' }
    } catch (err) {
      return { error: 'network_error', message: 'Could not reach AI service. Check your internet connection.' }
    }
  })
}

// ─── DEBTORS ──────────────────────────────────────────────────────────────────

function registerDebtorsHandlers(ipcMain) {
  // ── Customers ──────────────────────────────────────────────────────────────
  ipcMain.handle('debtors:getCustomers', () => {
    return getDb().prepare(`
      SELECT c.*,
        COUNT(cs.id) AS total_sales,
        COALESCE(SUM(cs.amount_owed), 0) AS total_owed,
        COALESCE(SUM(cs.amount_paid), 0) AS total_paid,
        COALESCE(SUM(cs.amount_owed) - SUM(cs.amount_paid), 0) AS outstanding
      FROM credit_customers c
      LEFT JOIN credit_sales cs ON cs.customer_id = c.id
      GROUP BY c.id
      ORDER BY c.name ASC
    `).all()
  })

  ipcMain.handle('debtors:addCustomer', (_, record, session) => {
    const db = getDb()
    const result = db.prepare(
      'INSERT INTO credit_customers (name, phone, notes) VALUES (@name, @phone, @notes)'
    ).run(record)
    const inserted = db.prepare('SELECT * FROM credit_customers WHERE id = ?').get(result.lastInsertRowid)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'debtors:addCustomer', entity: 'credit_customer', entityId: result.lastInsertRowid })
    syncWrite('credit_customers', 'upsert', inserted)
    return { id: result.lastInsertRowid, ...record }
  })

  ipcMain.handle('debtors:updateCustomer', (_, id, record, session) => {
    const db = getDb()
    db.prepare(
      "UPDATE credit_customers SET name=@name, phone=@phone, notes=@notes, updated_at=datetime('now') WHERE id=@id"
    ).run({ ...record, id })
    const updated = db.prepare('SELECT * FROM credit_customers WHERE id = ?').get(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'debtors:updateCustomer', entity: 'credit_customer', entityId: id })
    syncWrite('credit_customers', 'upsert', updated)
    return { id, ...record }
  })

  ipcMain.handle('debtors:deleteCustomer', (_, id, session) => {
    const db = getDb()
    const hasUnpaid = db.prepare(
      "SELECT COUNT(*) AS cnt FROM credit_sales WHERE customer_id = ? AND status != 'paid'"
    ).get(id)
    if (hasUnpaid.cnt > 0) return { error: 'has_unpaid', message: 'Customer has outstanding debts. Resolve all debts first.' }
    db.prepare('DELETE FROM credit_customers WHERE id = ?').run(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'debtors:deleteCustomer', entity: 'credit_customer', entityId: id })
    syncWrite('credit_customers', 'delete', { id })
    return { success: true }
  })

  // ── Credit Sales ────────────────────────────────────────────────────────────
  ipcMain.handle('debtors:getCreditSales', (_, { customer_id, month_year, status } = {}) => {
    const db = getDb()
    let query = `
      SELECT cs.*, c.name AS customer_name, c.phone AS customer_phone
      FROM credit_sales cs
      JOIN credit_customers c ON c.id = cs.customer_id
      WHERE 1=1
    `
    const params = []
    if (customer_id) { query += ' AND cs.customer_id = ?'; params.push(customer_id) }
    if (month_year)  { query += ' AND cs.month_year = ?';  params.push(month_year) }
    if (status)      { query += ' AND cs.status = ?';      params.push(status) }
    query += ' ORDER BY cs.date DESC'
    return db.prepare(query).all(...params)
  })

  ipcMain.handle('debtors:addCreditSale', (_, record, session) => {
    const db = getDb()
    const result = db.prepare(`
      INSERT INTO credit_sales
        (date, month_year, customer_id, egg_size, price_per_crate, crates, pieces, amount_paid, status, notes)
      VALUES
        (@date, @month_year, @customer_id, @egg_size, @price_per_crate, @crates, @pieces, @amount_paid, @status, @notes)
    `).run(record)
    const inserted = db.prepare('SELECT * FROM credit_sales WHERE id = ?').get(result.lastInsertRowid)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'debtors:addCreditSale', entity: 'credit_sale', entityId: result.lastInsertRowid })
    syncWrite('credit_sales', 'upsert', inserted)
    return { id: result.lastInsertRowid, ...record }
  })

  ipcMain.handle('debtors:updateCreditSale', (_, id, record, session) => {
    const monthYear = record.month_year || (record.date ? record.date.slice(0, 7) : null)
    const db = getDb()
    db.prepare(`
      UPDATE credit_sales SET
        date=@date, month_year=@month_year, egg_size=@egg_size, price_per_crate=@price_per_crate,
        crates=@crates, pieces=@pieces, amount_paid=@amount_paid, status=@status, notes=@notes,
        updated_at=datetime('now')
      WHERE id=@id
    `).run({ ...record, month_year: monthYear, id })
    const updated = db.prepare('SELECT * FROM credit_sales WHERE id = ?').get(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'debtors:updateCreditSale', entity: 'credit_sale', entityId: id })
    syncWrite('credit_sales', 'upsert', updated)
    return { id, ...record }
  })

  ipcMain.handle('debtors:deleteCreditSale', (_, id, session) => {
    const db = getDb()
    const sale = db.prepare('SELECT * FROM credit_sales WHERE id = ?').get(id)
    if (!sale) return { error: 'not_found' }
    if (sale.amount_paid > 0) return { error: 'has_payments', message: 'Cannot delete a sale that has received payments.' }
    db.prepare('DELETE FROM credit_sales WHERE id = ?').run(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'debtors:deleteCreditSale', entity: 'credit_sale', entityId: id })
    syncWrite('credit_sales', 'delete', { id })
    return { success: true }
  })

  // ── Debt Payments ───────────────────────────────────────────────────────────
  ipcMain.handle('debtors:addPayment', (_, record, session) => {
    const db = getDb()
    const sale = db.prepare('SELECT * FROM credit_sales WHERE id = ?').get(record.credit_sale_id)
    if (!sale) return { error: 'not_found' }

    const newPaid = (sale.amount_paid || 0) + record.amount
    const newStatus = newPaid >= sale.amount_owed ? 'paid'
      : newPaid > 0 ? 'partial'
      : 'unpaid'

    let insertedPayment
    db.transaction(() => {
      const payResult = db.prepare(`
        INSERT INTO debt_payments (credit_sale_id, date, month_year, amount, payment_method, notes)
        VALUES (@credit_sale_id, @date, @month_year, @amount, @payment_method, @notes)
      `).run(record)
      insertedPayment = db.prepare('SELECT * FROM debt_payments WHERE id = ?').get(payResult.lastInsertRowid)
      db.prepare(
        "UPDATE credit_sales SET amount_paid = ?, status = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(newPaid, newStatus, record.credit_sale_id)
    })()

    const updatedSale = db.prepare('SELECT * FROM credit_sales WHERE id = ?').get(record.credit_sale_id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'debtors:addPayment', entity: 'credit_sale', entityId: record.credit_sale_id, details: { amount: record.amount } })
    syncWrite('debt_payments', 'upsert', insertedPayment)
    syncWrite('credit_sales', 'upsert', updatedSale)
    return { success: true, newPaid, newStatus }
  })

  ipcMain.handle('debtors:getPayments', (_, credit_sale_id) => {
    return getDb().prepare(
      'SELECT * FROM debt_payments WHERE credit_sale_id = ? ORDER BY date ASC'
    ).all(credit_sale_id)
  })

  // ── Summary ─────────────────────────────────────────────────────────────────
  ipcMain.handle('debtors:getSummary', (_, month_year) => {
    const db = getDb()
    const totals = db.prepare(`
      SELECT
        COUNT(*) AS total_sales,
        COALESCE(SUM(amount_owed), 0) AS total_owed,
        COALESCE(SUM(amount_paid), 0) AS total_paid,
        COALESCE(SUM(amount_owed) - SUM(amount_paid), 0) AS outstanding,
        COUNT(CASE WHEN status = 'unpaid'  THEN 1 END) AS count_unpaid,
        COUNT(CASE WHEN status = 'partial' THEN 1 END) AS count_partial,
        COUNT(CASE WHEN status = 'paid'    THEN 1 END) AS count_paid
      FROM credit_sales
      WHERE month_year = ?
    `).get(month_year)

    const byCustomer = db.prepare(`
      SELECT c.id, c.name, c.phone,
        COALESCE(SUM(cs.amount_owed), 0) AS total_owed,
        COALESCE(SUM(cs.amount_paid), 0) AS total_paid,
        COALESCE(SUM(cs.amount_owed) - SUM(cs.amount_paid), 0) AS outstanding
      FROM credit_customers c
      JOIN credit_sales cs ON cs.customer_id = c.id
      WHERE cs.month_year = ?
      GROUP BY c.id
      ORDER BY outstanding DESC
    `).all(month_year)

    return { totals, byCustomer }
  })
}

// ─── POULTRY CONTROL RECORD ───────────────────────────────────────────────────

function registerReportHandlers(ipcMain) {
  // Returns all data needed for the Poultry Control Record for a date range
  ipcMain.handle('report:poultryControl', (_, { from, to }) => {
    const db = getDb()

    const flocks = db.prepare('SELECT * FROM flocks WHERE is_active = 1 ORDER BY sort_order ASC').all()

    // Cumulative mortality before start date per flock (for opening stock calc)
    const mortalityBefore = db.prepare(`
      SELECT flock_id, COALESCE(SUM(count), 0) AS total
      FROM flock_movements WHERE date < ?
      GROUP BY flock_id
    `).all(from)
    const mortalityBeforeMap = Object.fromEntries(mortalityBefore.map(r => [r.flock_id, r.total]))

    // Daily mortality in range
    const mortality = db.prepare(`
      SELECT date, flock_id, COALESCE(SUM(count), 0) AS count
      FROM flock_movements WHERE date >= ? AND date <= ?
      GROUP BY date, flock_id ORDER BY date ASC
    `).all(from, to)

    // Daily feed in range (sum per flock per day)
    const feed = db.prepare(`
      SELECT date, flock_id, COALESCE(SUM(quantity_kg), 0) AS quantity_kg
      FROM feed_log WHERE date >= ? AND date <= ?
      GROUP BY date, flock_id ORDER BY date ASC
    `).all(from, to)

    // Daily water in range
    const water = db.prepare(`
      SELECT date, flock_id, COALESCE(SUM(litres), 0) AS litres
      FROM water_log WHERE date >= ? AND date <= ?
      GROUP BY date, flock_id ORDER BY date ASC
    `).all(from, to)

    // Health records in range (vaccination/drugs)
    const health = db.prepare(`
      SELECT date, flock_id, GROUP_CONCAT(name, ', ') AS treatments
      FROM health_records WHERE date >= ? AND date <= ?
      GROUP BY date, flock_id ORDER BY date ASC
    `).all(from, to)

    return { flocks, mortalityBeforeMap, mortality, feed, water, health }
  })
}

function registerSyncHandlers(ipcMain) {
  ipcMain.handle('sync:toSupabase', async () => {
    const { url, key } = getSupabaseCreds()
    if (!url || !key) return { success: false, error: 'Supabase credentials not configured.' }
    const { pushToSupabase } = require('./supabaseSync')
    const result = await pushToSupabase(getDb(), url, key)
    if (result.success) saveLastSync(result.syncedAt)
    return result
  })

  ipcMain.handle('sync:fromSupabase', async () => {
    const { url, key } = getSupabaseCreds()
    if (!url || !key) return { success: false, error: 'Supabase credentials not configured.' }
    const { pullFromSupabase } = require('./supabaseSync')
    const result = await pullFromSupabase(getDb(), url, key)
    if (result.success) saveLastSync(result.syncedAt)
    return result
  })

  ipcMain.handle('sync:flushQueue', async () => {
    const { url, key } = getSupabaseCreds()
    if (!url || !key) return { flushed: 0, remaining: 0 }
    const { flushOfflineQueue } = require('./supabaseSync')
    return flushOfflineQueue(getDb(), url, key)
  })

  ipcMain.handle('sync:getQueueCount', () => {
    return getDb().prepare('SELECT COUNT(*) as c FROM offline_queue').get().c
  })

  ipcMain.handle('sync:getLastSync', () => {
    const row = getDb().prepare("SELECT value FROM settings WHERE key = 'last_sync_at'").get()
    return row?.value || null
  })

  ipcMain.handle('sync:saveLastSync', (_, isoString) => {
    saveLastSync(isoString)
    return { success: true }
  })
}

function saveLastSync(iso) {
  getDb().prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES ('last_sync_at', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(iso)
}

module.exports = { registerHandlers, setMainWindow }
