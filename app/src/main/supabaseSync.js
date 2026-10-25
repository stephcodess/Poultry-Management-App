const TABLES = [
  { name: 'users',            conflictKey: 'id',              exclude: ['invite_token', 'invite_expires_at'] },
  { name: 'flocks',           conflictKey: 'id',              exclude: [] },
  { name: 'flock_movements',  conflictKey: 'id',              exclude: [] },
  { name: 'production',       conflictKey: 'id',              exclude: ['total_eggs', 'daily_yield_pct'] },
  { name: 'credit_customers', conflictKey: 'id',              exclude: [] },
  { name: 'credit_sales',     conflictKey: 'id',              exclude: ['amount_owed'] },
  { name: 'sales',            conflictKey: 'id',              exclude: ['total_revenue', 'credit_customer_id', 'credit_sale_id'] },
  { name: 'domestic_usage',   conflictKey: 'id',              exclude: [] },
  { name: 'expenses',         conflictKey: 'id',              exclude: [] },
  { name: 'feed_log',         conflictKey: 'id',              exclude: ['total_cost'] },
  { name: 'health_records',   conflictKey: 'id',              exclude: [] },
  { name: 'monthly_balance',  conflictKey: 'month_year',      exclude: [] },
  { name: 'opening_stock',    conflictKey: 'month_year,flock_id', exclude: [] },
  { name: 'egg_prices',       conflictKey: 'id',              exclude: [] },
  { name: 'settings',         conflictKey: 'key',             exclude: [], remoteTable: 'app_settings' },
  { name: 'debt_payments',    conflictKey: 'id',              exclude: [] },
  { name: 'water_log',        conflictKey: 'id',              exclude: [] },
]

// Columns that are SQLite-generated and must never be sent to Supabase
const EXCLUDE_MAP = Object.fromEntries(TABLES.map(t => [t.name, t.exclude]))
const CONFLICT_MAP = Object.fromEntries(TABLES.map(t => [t.name, t.conflictKey]))
const REMOTE_TABLE_MAP = Object.fromEntries(TABLES.map(t => [t.name, t.remoteTable || t.name]))

function stripColumns(rows, exclude) {
  if (!exclude.length) return rows
  return rows.map(row => {
    const clean = { ...row }
    exclude.forEach(col => delete clean[col])
    return clean
  })
}

function makeHeaders(supabaseKey) {
  return {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates',
  }
}

async function upsertChunk(url, remoteTable, conflictKey, chunk, headers) {
  const res = await fetch(`${url}/rest/v1/${remoteTable}?on_conflict=${conflictKey}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(chunk),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
}

async function deleteRemote(url, remoteTable, conflictKey, payload, headers) {
  // payload is a single record; delete by its conflict key(s)
  const keys = conflictKey.split(',')
  const filters = keys.map(k => `${k}=eq.${payload[k]}`).join('&')
  const res = await fetch(`${url}/rest/v1/${remoteTable}?${filters}`, {
    method: 'DELETE',
    headers,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
}

// ─── PULL: Supabase → SQLite ──────────────────────────────────────────────────

async function pullFromSupabase(db, supabaseUrl, supabaseKey) {
  const headers = makeHeaders(supabaseKey)
  const counts = {}
  const failedTables = []

  for (const { name, conflictKey, remoteTable } of TABLES) {
    const target = remoteTable || name
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/${target}?select=*`, { headers })
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText)
        throw new Error(`HTTP ${res.status}: ${text}`)
      }
      const rows = await res.json()
      if (!Array.isArray(rows) || rows.length === 0) { counts[name] = 0; continue }

      // Upsert each row into local SQLite
      const cols = Object.keys(rows[0])
      const placeholders = cols.map(() => '?').join(', ')
      const conflictCols = conflictKey.split(',')
      const updateSet = cols
        .filter(c => !conflictCols.includes(c))
        .map(c => `${c} = excluded.${c}`)
        .join(', ')

      const stmt = updateSet.length
        ? db.prepare(`INSERT INTO ${name} (${cols.join(', ')}) VALUES (${placeholders})
            ON CONFLICT(${conflictKey}) DO UPDATE SET ${updateSet}`)
        : db.prepare(`INSERT OR IGNORE INTO ${name} (${cols.join(', ')}) VALUES (${placeholders})`)

      const insertMany = db.transaction(rowList => {
        for (const row of rowList) stmt.run(...cols.map(c => row[c] ?? null))
      })
      insertMany(rows)
      counts[name] = rows.length
    } catch (err) {
      console.error(`[pullFromSupabase] Failed table "${name}":`, err.message)
      failedTables.push(`${name} (${err.message})`)
    }
  }

  if (failedTables.length > 0) {
    return { success: false, error: `Pull failed:\n${failedTables.join('\n')}`, counts }
  }
  return { success: true, counts, syncedAt: new Date().toISOString() }
}

// ─── PUSH: SQLite → Supabase (full snapshot, used for manual sync) ────────────

async function pushToSupabase(db, supabaseUrl, supabaseKey) {
  const headers = makeHeaders(supabaseKey)
  const counts = {}
  const failedTables = []

  for (const { name, conflictKey, exclude, remoteTable } of TABLES) {
    const target = remoteTable || name
    try {
      const rows = db.prepare(`SELECT * FROM ${name}`).all()
      const cleaned = stripColumns(rows, exclude)
      for (let i = 0; i < cleaned.length; i += 500) {
        await upsertChunk(supabaseUrl, target, conflictKey, cleaned.slice(i, i + 500), headers)
      }
      counts[name] = cleaned.length
    } catch (err) {
      console.error(`[pushToSupabase] Failed table "${name}":`, err.message)
      failedTables.push(`${name} (${err.message})`)
    }
  }

  if (failedTables.length > 0) {
    return { success: false, error: `Push failed:\n${failedTables.join('\n')}`, failedTables }
  }
  return { success: true, counts, syncedAt: new Date().toISOString() }
}

// ─── SINGLE-RECORD WRITE: push one record, queue if offline ──────────────────

async function pushRecord(db, supabaseUrl, supabaseKey, tableName, operation, payload) {
  const conflictKey = CONFLICT_MAP[tableName] || 'id'
  const remoteTable = REMOTE_TABLE_MAP[tableName] || tableName
  const exclude = EXCLUDE_MAP[tableName] || []
  const cleaned = stripColumns([payload], exclude)[0]

  try {
    const headers = makeHeaders(supabaseKey)
    if (operation === 'delete') {
      await deleteRemote(supabaseUrl, remoteTable, conflictKey, cleaned, headers)
    } else {
      await upsertChunk(supabaseUrl, remoteTable, conflictKey, [cleaned], headers)
    }
    return { queued: false }
  } catch (err) {
    // Offline or Supabase error — queue for later
    console.warn(`[pushRecord] Queuing ${operation} on ${tableName}:`, err.message)
    db.prepare(`
      INSERT INTO offline_queue (table_name, remote_table, operation, conflict_key, payload)
      VALUES (?, ?, ?, ?, ?)
    `).run(tableName, remoteTable, operation, conflictKey, JSON.stringify(cleaned))
    return { queued: true }
  }
}

// ─── FLUSH: replay queued offline writes ─────────────────────────────────────

async function flushOfflineQueue(db, supabaseUrl, supabaseKey) {
  const queue = db.prepare('SELECT * FROM offline_queue ORDER BY id ASC').all()
  if (queue.length === 0) return { flushed: 0, remaining: 0 }

  const headers = makeHeaders(supabaseKey)
  let flushed = 0

  for (const item of queue) {
    try {
      const payload = JSON.parse(item.payload)
      if (item.operation === 'delete') {
        await deleteRemote(supabaseUrl, item.remote_table, item.conflict_key, payload, headers)
      } else {
        await upsertChunk(supabaseUrl, item.remote_table, item.conflict_key, [payload], headers)
      }
      db.prepare('DELETE FROM offline_queue WHERE id = ?').run(item.id)
      flushed++
    } catch (err) {
      console.warn(`[flushOfflineQueue] Still failing item ${item.id}:`, err.message)
      break // stop at first failure — network still down
    }
  }

  const remaining = db.prepare('SELECT COUNT(*) as c FROM offline_queue').get().c
  return { flushed, remaining }
}

// ─── AUTH HELPERS: check/fetch a user from Supabase ──────────────────────────

async function fetchUserFromSupabase(supabaseUrl, supabaseKey, email) {
  const headers = makeHeaders(supabaseKey)
  const res = await fetch(
    `${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=*&limit=1`,
    { headers }
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const rows = await res.json()
  return rows[0] || null
}

module.exports = { pullFromSupabase, pushToSupabase, pushRecord, flushOfflineQueue, fetchUserFromSupabase }
