const TABLES = [
  { name: 'users', conflictKey: 'id', exclude: ['invite_token', 'invite_expires_at'] },
  { name: 'flocks', conflictKey: 'id', exclude: [] },
  { name: 'flock_movements', conflictKey: 'id', exclude: [] },
  { name: 'production', conflictKey: 'id', exclude: ['total_eggs', 'daily_yield_pct'] },
  { name: 'credit_customers', conflictKey: 'id', exclude: [] },
  { name: 'credit_sales', conflictKey: 'id', exclude: ['amount_owed'] },
  { name: 'sales', conflictKey: 'id', exclude: ['total_revenue', 'credit_customer_id', 'credit_sale_id'] },
  { name: 'domestic_usage', conflictKey: 'id', exclude: [] },
  { name: 'expenses', conflictKey: 'id', exclude: [] },
  { name: 'feed_log', conflictKey: 'id', exclude: ['total_cost'] },
  { name: 'health_records', conflictKey: 'id', exclude: [] },
  { name: 'monthly_balance', conflictKey: 'month_year', exclude: [] },
  { name: 'opening_stock', conflictKey: 'month_year,flock_id', exclude: [] },
  { name: 'egg_prices', conflictKey: 'id', exclude: [] },
  { name: 'settings', conflictKey: 'key', exclude: [], remoteTable: 'app_settings' },
  { name: 'debt_payments', conflictKey: 'id', exclude: [] },
]

function stripColumns(rows, exclude) {
  if (!exclude.length) return rows
  return rows.map(row => {
    const clean = { ...row }
    exclude.forEach(col => delete clean[col])
    return clean
  })
}

async function upsertChunk(url, table, conflictKey, chunk, headers) {
  const res = await fetch(
    `${url}/rest/v1/${table}?on_conflict=${conflictKey}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(chunk),
    }
  )
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
}

async function syncToSupabase(db, supabaseUrl, supabaseKey) {
  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates',
  }

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
      console.error(`[supabaseSync] Failed to sync table "${name}":`, err.message)
      failedTables.push(`${name} (${err.message})`)
    }
  }

  if (failedTables.length > 0) {
    return { success: false, error: `Failed to sync:\n${failedTables.join('\n')}`, failedTables }
  }

  return { success: true, counts, syncedAt: new Date().toISOString() }
}

module.exports = { syncToSupabase }
