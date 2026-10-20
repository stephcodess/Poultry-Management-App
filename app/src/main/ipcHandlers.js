const { getDb } = require('../database/db')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const { saveSession, loadSession, clearSession } = require('./sessionManager')
const { logActivity } = require('./activityLogger')

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

// ─── AUTO-SYNC ────────────────────────────────────────────────────────────────
// Debounced background sync — fires 5 s after the last write operation.
// Only runs if supabase_url and supabase_anon_key are configured.

let _autoSyncTimer = null
let _mainWindow = null

function setMainWindow(win) { _mainWindow = win }

function scheduleAutoSync() {
  clearTimeout(_autoSyncTimer)
  _autoSyncTimer = setTimeout(async () => {
    const db = getDb()
    const urlRow = db.prepare("SELECT value FROM settings WHERE key = 'supabase_url'").get()
    const keyRow = db.prepare("SELECT value FROM settings WHERE key = 'supabase_anon_key'").get()
    if (!urlRow?.value || !keyRow?.value) return

    try {
      const { syncToSupabase } = require('./supabaseSync')
      const result = await syncToSupabase(db, urlRow.value, keyRow.value)
      if (result.success) {
        const iso = result.syncedAt || new Date().toISOString()
        db.prepare(`
          INSERT INTO settings (key, value, updated_at) VALUES ('last_sync_at', ?, datetime('now'))
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `).run(iso)
        _mainWindow?.webContents?.send('sync:autoSyncComplete', { success: true, syncedAt: iso })
      } else {
        _mainWindow?.webContents?.send('sync:autoSyncComplete', { success: false, error: result.error })
      }
    } catch (err) {
      console.error('[autoSync] failed:', err.message)
    }
  }, 5000)
}

function registerHandlers(ipcMain) {
  // Proxy that auto-schedules a sync after any write channel resolves
  const WRITE_RE = /:add$|:update$|:delete$|:upsert$|:rollover$/
  const proxy = {
    handle(channel, handler) {
      ipcMain.handle(channel, async (...args) => {
        const result = await handler(...args)
        if (WRITE_RE.test(channel)) scheduleAutoSync()
        return result
      })
    },
  }

  registerAuthHandlers(proxy)
  registerFlockHandlers(proxy)
  registerProductionHandlers(proxy)
  registerSalesHandlers(proxy)
  registerDomesticHandlers(proxy)
  registerExpensesHandlers(proxy)
  registerSettingsHandlers(proxy)
  registerDashboardHandlers(proxy)
  registerMortalityHandlers(proxy)
  registerFeedHandlers(proxy)
  registerHealthHandlers(proxy)
  registerBalanceInto(proxy)
  registerAIHandlers(proxy)
  registerDebtorsHandlers(proxy)
  registerSyncHandlers(ipcMain) // sync handlers use real ipcMain (no auto-sync loop)
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────

function registerAuthHandlers(ipcMain) {
  // Step 1: check email — returns what the login screen should show next
  ipcMain.handle('auth:checkEmail', (_, { email }) => {
    const db = getDb()
    const user = db.prepare('SELECT id, name, email, role, password_hash, is_active FROM users WHERE email = ?').get(email)
    if (!user) return { status: 'not_found' }
    if (!user.is_active) return { status: 'inactive' }
    if (!user.password_hash) return { status: 'pending', name: user.name } // invited, no password yet
    return { status: 'active', name: user.name }
  })

  // Step 2a: existing active user — verify password and log in
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
    return { success: true, user: sessionUser }
  })

  // Step 2b: pending invited user — set password for the first time (email is enough, no token)
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
    return { success: true, user: sessionUser }
  })

  // Invite user — just register them by email, no token needed
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
    const user = db.prepare('SELECT id, name, email, role FROM users WHERE email = ?').get(email)
    logActivity({ userId: session.id, userName: session.name, userEmail: session.email, action: 'user:invite', entity: 'user', entityId: user.id, details: { email, role } })
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
    logActivity({ userId: session.id, userName: session.name, userEmail: session.email, action: 'user:update', entity: 'user', entityId: id, details: { role, is_active } })
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
    logActivity({ userId: session.id, userName: session.name, userEmail: session.email, action: 'auth:changePassword' })
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

  // First-time owner setup: set password without token (only if account has no password yet)
  ipcMain.handle('auth:setOwnerPassword', async (_, { email, newPassword }) => {
    const db = getDb()
    const user = db.prepare("SELECT * FROM users WHERE email = ? AND role = 'owner' AND password_hash IS NULL AND is_active = 1").get(email)
    if (!user) return { error: 'not_eligible', message: 'Account not eligible for first-time setup.' }
    const hash = await bcrypt.hash(newPassword, 12)
    db.prepare("UPDATE users SET password_hash = ?, last_login_at = datetime('now') WHERE id = ?").run(hash, user.id)
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)
    const sessionUser = { id: updated.id, name: updated.name, email: updated.email, role: updated.role }
    logActivity({ userId: updated.id, userName: updated.name, userEmail: updated.email, action: 'auth:ownerSetup' })
    return { success: true, user: sessionUser }
  })

  ipcMain.handle('auth:loadSession', () => loadSession())
  ipcMain.handle('auth:saveSession', (_, sessionData) => { saveSession(sessionData); return { success: true } })
  ipcMain.handle('auth:logout', (_, session) => {
    if (session) logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'auth:logout' })
    clearSession()
    return { success: true }
  })

  ipcMain.handle('auth:resetUserPassword', async (_, { id, newPassword }, session) => {
    if (!session || session.role !== 'owner') return { error: 'forbidden' }
    const hash = await bcrypt.hash(newPassword, 12)
    getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id)
    logActivity({ userId: session.id, userName: session.name, userEmail: session.email, action: 'user:resetPassword', entity: 'user', entityId: id })
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
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'flocks:add', entity: 'flock', entityId: result.lastInsertRowid })
    return { id: result.lastInsertRowid, ...flock }
  })

  ipcMain.handle('flocks:update', (_, id, flock, session) => {
    getDb().prepare(
      `UPDATE flocks SET name=@name, color=@color, is_active=@is_active, initial_bird_count=@initial_bird_count,
       date_acquired=@date_acquired, breed=@breed, expected_lay_end=@expected_lay_end, target_yield_pct=@target_yield_pct
       WHERE id=@id`
    ).run({ date_acquired: null, breed: null, expected_lay_end: null, target_yield_pct: 80, ...flock, id })
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'flocks:update', entity: 'flock', entityId: id })
    return { id, ...flock }
  })

  ipcMain.handle('flocks:delete', (_, id, session) => {
    getDb().prepare('DELETE FROM flocks WHERE id = ?').run(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'flocks:delete', entity: 'flock', entityId: id })
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
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'production:add', entity: 'production', entityId: result.lastInsertRowid })
    return { id: result.lastInsertRowid, ...clean }
  })

  ipcMain.handle('production:update', (_, id, record, session) => {
    getDb().prepare(`
      UPDATE production SET
        date = @date, flock_id = @flock_id,
        no_of_birds = @no_of_birds, crates = @crates, pieces = @pieces,
        updated_at = datetime('now')
      WHERE id = @id
    `).run({ ...record, id })
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'production:update', entity: 'production', entityId: id })
    return { id, ...record }
  })

  ipcMain.handle('production:delete', (_, id, session) => {
    getDb().prepare('DELETE FROM production WHERE id = ?').run(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'production:delete', entity: 'production', entityId: id })
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

    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'sales:add', entity: 'sales', entityId: saleId })
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
    }

    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'sales:update', entity: 'sales', entityId: id })
    return { id, ...record }
  })

  ipcMain.handle('sales:delete', (_, id, session) => {
    const db = getDb()
    const sale = db.prepare('SELECT credit_sale_id FROM sales WHERE id = ?').get(id)
    db.prepare('DELETE FROM sales WHERE id = ?').run(id)
    // Remove the auto-created credit_sale only if it has no payments
    if (sale?.credit_sale_id) {
      const cs = db.prepare('SELECT amount_paid FROM credit_sales WHERE id = ?').get(sale.credit_sale_id)
      if (cs && cs.amount_paid === 0) {
        db.prepare('DELETE FROM credit_sales WHERE id = ?').run(sale.credit_sale_id)
      }
    }
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'sales:delete', entity: 'sales', entityId: id })
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
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'domestic:add', entity: 'domestic', entityId: result.lastInsertRowid })
    return { id: result.lastInsertRowid, ...record }
  })

  ipcMain.handle('domestic:update', (_, id, record, session) => {
    getDb().prepare(`
      UPDATE domestic_usage SET
        date = @date, location = @location, crates = @crates,
        pieces = @pieces, flock_id = @flock_id,
        updated_at = datetime('now')
      WHERE id = @id
    `).run({ ...record, id })
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'domestic:update', entity: 'domestic', entityId: id })
    return { id, ...record }
  })

  ipcMain.handle('domestic:delete', (_, id, session) => {
    getDb().prepare('DELETE FROM domestic_usage WHERE id = ?').run(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'domestic:delete', entity: 'domestic', entityId: id })
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
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'expenses:add', entity: 'expenses', entityId: result.lastInsertRowid })
    return { id: result.lastInsertRowid, ...record }
  })

  ipcMain.handle('expenses:update', (_, id, record, session) => {
    getDb().prepare(`
      UPDATE expenses SET
        date = @date, category = @category, description = @description,
        payment_method = @payment_method, amount = @amount,
        feed_type = @feed_type, quantity_kg = @quantity_kg, bags = @bags, supplier = @supplier,
        updated_at = datetime('now')
      WHERE id = @id
    `).run({ feed_type: null, quantity_kg: null, bags: null, supplier: null, ...record, id })
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'expenses:update', entity: 'expenses', entityId: id })
    return { id, ...record }
  })

  ipcMain.handle('expenses:delete', (_, id, session) => {
    getDb().prepare('DELETE FROM expenses WHERE id = ?').run(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'expenses:delete', entity: 'expenses', entityId: id })
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
    getDb().prepare(`
      INSERT INTO monthly_balance (month_year, opening_balance, notes, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(month_year) DO UPDATE SET
        opening_balance = excluded.opening_balance,
        notes = excluded.notes,
        updated_at = excluded.updated_at
    `).run(month_year, opening_balance, notes || null)
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
    const result = getDb().prepare(`
      INSERT INTO flock_movements (date, month_year, flock_id, count, reason, notes)
      VALUES (@date, @month_year, @flock_id, @count, @reason, @notes)
    `).run(record)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'mortality:add', entity: 'flock_movement', entityId: result.lastInsertRowid })
    return { id: result.lastInsertRowid, ...record }
  })

  ipcMain.handle('mortality:update', (_, id, record, session) => {
    getDb().prepare(`
      UPDATE flock_movements SET date=@date, flock_id=@flock_id, count=@count,
        reason=@reason, notes=@notes, updated_at=datetime('now')
      WHERE id=@id
    `).run({ ...record, id })
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'mortality:update', entity: 'flock_movement', entityId: id })
    return { id, ...record }
  })

  ipcMain.handle('mortality:delete', (_, id, session) => {
    getDb().prepare('DELETE FROM flock_movements WHERE id=?').run(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'mortality:delete', entity: 'flock_movement', entityId: id })
    return { success: true }
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
      SELECT f.id, f.name, f.color, f.initial_bird_count,
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
    const result = getDb().prepare(`
      INSERT INTO feed_log (date, month_year, flock_id, feed_type, quantity_kg, notes)
      VALUES (@date, @month_year, @flock_id, @feed_type, @quantity_kg, @notes)
    `).run(record)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'feed:add', entity: 'feed', entityId: result.lastInsertRowid })
    return { id: result.lastInsertRowid, ...record }
  })

  ipcMain.handle('feed:update', (_, id, record, session) => {
    getDb().prepare(`
      UPDATE feed_log SET date=@date, flock_id=@flock_id, feed_type=@feed_type,
        quantity_kg=@quantity_kg, notes=@notes, updated_at=datetime('now')
      WHERE id=@id
    `).run({ ...record, id })
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'feed:update', entity: 'feed', entityId: id })
    return { id, ...record }
  })

  ipcMain.handle('feed:delete', (_, id, session) => {
    getDb().prepare('DELETE FROM feed_log WHERE id=?').run(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'feed:delete', entity: 'feed', entityId: id })
    return { success: true }
  })

  ipcMain.handle('feed:getStock', () => {
    const db = getDb()

    // Total purchased all-time: from expenses where category = 'Feed' and quantity_kg is set
    const purchased = db.prepare(
      "SELECT COALESCE(SUM(quantity_kg),0) AS total_kg FROM expenses WHERE category='Feed' AND quantity_kg IS NOT NULL AND quantity_kg > 0"
    ).get()

    // Total consumed all-time: from feed_log (daily usage entries)
    const consumed = db.prepare(
      'SELECT COALESCE(SUM(quantity_kg),0) AS total_kg FROM feed_log'
    ).get()

    const stockOnHandKg = Math.max((purchased.total_kg || 0) - (consumed.total_kg || 0), 0)

    // By feed type: purchased vs consumed
    const purchasedByType = db.prepare(
      "SELECT feed_type, COALESCE(SUM(quantity_kg),0) AS kg FROM expenses WHERE category='Feed' AND feed_type IS NOT NULL AND quantity_kg > 0 GROUP BY feed_type"
    ).all()
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
    const result = getDb().prepare(`
      INSERT INTO health_records
        (date, month_year, flock_id, record_type, name, dosage, administered_by, cost, next_due_date, notes)
      VALUES
        (@date, @month_year, @flock_id, @record_type, @name, @dosage, @administered_by, @cost, @next_due_date, @notes)
    `).run(record)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'health:add', entity: 'health', entityId: result.lastInsertRowid })
    return { id: result.lastInsertRowid, ...record }
  })

  ipcMain.handle('health:update', (_, id, record, session) => {
    getDb().prepare(`
      UPDATE health_records SET date=@date, flock_id=@flock_id, record_type=@record_type,
        name=@name, dosage=@dosage, administered_by=@administered_by, cost=@cost,
        next_due_date=@next_due_date, notes=@notes, updated_at=datetime('now')
      WHERE id=@id
    `).run({ ...record, id })
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'health:update', entity: 'health', entityId: id })
    return { id, ...record }
  })

  ipcMain.handle('health:delete', (_, id, session) => {
    getDb().prepare('DELETE FROM health_records WHERE id=?').run(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'health:delete', entity: 'health', entityId: id })
    return { success: true }
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

function registerAIHandlers(ipcMain) {
  ipcMain.handle('ai:chat', async (_, { messages }) => {
    const db = getDb()

    const apiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get()
    const apiKey = apiKeyRow?.value
    if (!apiKey) return { error: 'no_key', message: 'No Gemini API key configured. Please add it in Settings.' }

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

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents }),
        }
      )

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        const msg = err?.error?.message || `Gemini API error: ${response.status}`
        return { error: 'api_error', message: msg }
      }

      const data = await response.json()
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) return { error: 'empty_response', message: 'No response from Gemini.' }

      return { success: true, reply: text }
    } catch (err) {
      return { error: 'network_error', message: 'Could not reach Gemini. Check your internet connection.' }
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
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'debtors:addCustomer', entity: 'credit_customer', entityId: result.lastInsertRowid })
    return { id: result.lastInsertRowid, ...record }
  })

  ipcMain.handle('debtors:updateCustomer', (_, id, record, session) => {
    getDb().prepare(
      "UPDATE credit_customers SET name=@name, phone=@phone, notes=@notes, updated_at=datetime('now') WHERE id=@id"
    ).run({ ...record, id })
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'debtors:updateCustomer', entity: 'credit_customer', entityId: id })
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
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'debtors:addCreditSale', entity: 'credit_sale', entityId: result.lastInsertRowid })
    return { id: result.lastInsertRowid, ...record }
  })

  ipcMain.handle('debtors:updateCreditSale', (_, id, record, session) => {
    const monthYear = record.month_year || (record.date ? record.date.slice(0, 7) : null)
    getDb().prepare(`
      UPDATE credit_sales SET
        date=@date, month_year=@month_year, egg_size=@egg_size, price_per_crate=@price_per_crate,
        crates=@crates, pieces=@pieces, amount_paid=@amount_paid, status=@status, notes=@notes,
        updated_at=datetime('now')
      WHERE id=@id
    `).run({ ...record, month_year: monthYear, id })
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'debtors:updateCreditSale', entity: 'credit_sale', entityId: id })
    return { id, ...record }
  })

  ipcMain.handle('debtors:deleteCreditSale', (_, id, session) => {
    const db = getDb()
    const sale = db.prepare('SELECT * FROM credit_sales WHERE id = ?').get(id)
    if (!sale) return { error: 'not_found' }
    if (sale.amount_paid > 0) return { error: 'has_payments', message: 'Cannot delete a sale that has received payments.' }
    db.prepare('DELETE FROM credit_sales WHERE id = ?').run(id)
    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'debtors:deleteCreditSale', entity: 'credit_sale', entityId: id })
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

    db.transaction(() => {
      db.prepare(`
        INSERT INTO debt_payments (credit_sale_id, date, month_year, amount, payment_method, notes)
        VALUES (@credit_sale_id, @date, @month_year, @amount, @payment_method, @notes)
      `).run(record)
      db.prepare(
        "UPDATE credit_sales SET amount_paid = ?, status = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(newPaid, newStatus, record.credit_sale_id)
    })()

    logActivity({ userId: session?.id, userName: session?.name, userEmail: session?.email, action: 'debtors:addPayment', entity: 'credit_sale', entityId: record.credit_sale_id, details: { amount: record.amount } })
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

function registerSyncHandlers(ipcMain) {
  ipcMain.handle('sync:toSupabase', async () => {
    const db = getDb()
    const urlRow = db.prepare("SELECT value FROM settings WHERE key = 'supabase_url'").get()
    const keyRow = db.prepare("SELECT value FROM settings WHERE key = 'supabase_anon_key'").get()
    if (!urlRow?.value || !keyRow?.value) {
      return { success: false, error: 'Supabase URL and anon key not configured. Go to Settings → Cloud Sync.' }
    }
    const { syncToSupabase } = require('./supabaseSync')
    return syncToSupabase(db, urlRow.value, keyRow.value)
  })

  ipcMain.handle('sync:getLastSync', () => {
    const row = getDb().prepare("SELECT value FROM settings WHERE key = 'last_sync_at'").get()
    return row?.value || null
  })

  ipcMain.handle('sync:saveLastSync', (_, isoString) => {
    getDb().prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES ('last_sync_at', ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(isoString)
    return { success: true }
  })
}

module.exports = { registerHandlers, setMainWindow }
