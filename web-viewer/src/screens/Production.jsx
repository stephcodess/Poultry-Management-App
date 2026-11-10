import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useMonth } from '../utils/MonthContext'
import { useAuth } from '../utils/AuthContext'
import { formatDate, formatEggs, toMonthYear } from '../utils/format'
import Modal from '../components/common/Modal'
import Button from '../components/common/Button'
import FormField from '../components/common/FormField'
import styles from './Production.module.css'
import dayjs from 'dayjs'

const EMPTY_FORM = {
  date: dayjs().format('YYYY-MM-DD'),
  flock_id: '',
  no_of_birds: '',
  crates: '',
  pieces: '',
}

function Input({ type = 'text', value, onChange, ...props }) {
  return (
    <input type={type} value={value} onChange={onChange} {...props}
      style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 15, outline: 'none', fontFamily: 'var(--font)', background: 'var(--color-surface)', color: 'var(--color-text)', ...props.style }} />
  )
}

function Sel({ value, onChange, children, ...props }) {
  return (
    <select value={value} onChange={onChange} {...props}
      style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 15, outline: 'none', fontFamily: 'var(--font)', background: 'var(--color-surface)', color: 'var(--color-text)', cursor: 'pointer', ...props.style }}
    >{children}</select>
  )
}

export default function Production() {
  const { monthYear } = useMonth()
  const { can } = useAuth()

  const [records, setRecords] = useState([])
  const [flocks, setFlocks] = useState([])
  const [liveBirdCounts, setLiveBirdCounts] = useState({})
  const [openingStock, setOpeningStock] = useState({}) // flock_id -> { crates, pieces }
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [showModal, setShowModal] = useState(false)
  const [editRecord, setEditRecord] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [showOpeningModal, setShowOpeningModal] = useState(false)
  const [openingForms, setOpeningForms] = useState({})
  const [dismissedAlerts, setDismissedAlerts] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [prodRes, flocksRes, movRes] = await Promise.all([
        supabase.from('production').select('*, flocks(name, color)').eq('month_year', monthYear).order('date', { ascending: false }),
        supabase.from('flocks').select('*').neq('is_active', 0).order('name'),
        supabase.from('flock_movements').select('flock_id, count, reason').order('date'),
      ])
      const rows = prodRes.data || []
      const fks = flocksRes.data || []
      const movements = movRes.data || []

      setRecords(rows)
      setFlocks(fks)

      // Build live bird counts
      const counts = {}
      fks.forEach(fk => {
        const initial = fk.initial_bird_count || 0
        const removed = movements.filter(m => m.flock_id === fk.id).reduce((s, m) => s + (m.count || 0), 0)
        counts[fk.id] = Math.max(0, initial - removed)
      })
      setLiveBirdCounts(counts)

      // Build opening stock from production records marked as opening
      const os = {}
      rows.filter(r => r._is_opening).forEach(r => {
        os[r.flock_id] = { crates: r.crates || 0, pieces: r.pieces || 0 }
      })
      setOpeningStock(os)

      // Init opening forms per flock
      const of_ = {}
      fks.forEach(fk => { of_[fk.id] = os[fk.id] || { crates: '', pieces: '' } })
      setOpeningForms(of_)
    } finally {
      setLoading(false)
    }
  }, [monthYear])

  useEffect(() => { load() }, [load])

  // ── Stats ────────────────────────────────────────────────────
  const totalEggs = records.reduce((s, r) => s + (r.crates || 0) * 30 + (r.pieces || 0), 0)
  const avgYield = records.length
    ? (records.reduce((s, r) => s + (r.daily_yield_pct || 0), 0) / records.length).toFixed(1)
    : '0.0'

  const byFlock = flocks.map(fk => {
    const fkRecs = records.filter(r => r.flock_id === fk.id)
    const eggs = fkRecs.reduce((s, r) => s + (r.crates || 0) * 30 + (r.pieces || 0), 0)
    return { flock: fk, eggs, records: fkRecs.length }
  }).filter(f => f.eggs > 0)

  // ── Lifecycle alerts ─────────────────────────────────────────
  const lifecycleAlerts = flocks.filter(fk => {
    if (!fk.expected_retirement || dismissedAlerts.includes(fk.id)) return false
    const daysLeft = dayjs(fk.expected_retirement).diff(dayjs(), 'day')
    return daysLeft <= 90
  }).map(fk => {
    const daysLeft = dayjs(fk.expected_retirement).diff(dayjs(), 'day')
    return { flock: fk, daysLeft }
  })

  // ── Handlers ─────────────────────────────────────────────────
  function openAdd() {
    setEditRecord(null)
    const fk = flocks[0]
    setForm({ ...EMPTY_FORM, date: dayjs().format('YYYY-MM-DD'), flock_id: fk?.id || '', no_of_birds: fk ? String(liveBirdCounts[fk.id] || fk.initial_bird_count || '') : '' })
    setShowModal(true)
  }

  function openEdit(row) {
    setEditRecord(row)
    setForm({ date: row.date, flock_id: row.flock_id, no_of_birds: String(row.no_of_birds || ''), crates: String(row.crates || ''), pieces: String(row.pieces || '') })
    setShowModal(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const data = {
        date: form.date,
        month_year: toMonthYear(form.date),
        flock_id: Number(form.flock_id),
        no_of_birds: Number(form.no_of_birds) || null,
        crates: Number(form.crates),
        pieces: Number(form.pieces),
      }
      const totalEggsRow = data.crates * 30 + data.pieces
      if (data.no_of_birds > 0) {
        data.daily_yield_pct = parseFloat(((totalEggsRow / data.no_of_birds) * 100).toFixed(2))
      }
      if (editRecord) await supabase.from('production').update(data).eq('id', editRecord.id)
      else await supabase.from('production').insert(data)
      setShowModal(false)
      load()
    } finally { setSaving(false) }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this production record?')) return
    await supabase.from('production').delete().eq('id', id)
    load()
  }

  async function handleOpeningSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      for (const fk of flocks) {
        const f = openingForms[fk.id] || {}
        if (!f.crates && !f.pieces) continue
        await supabase.from('production').insert({
          date: monthYear + '-01',
          month_year: monthYear,
          flock_id: fk.id,
          no_of_birds: liveBirdCounts[fk.id] || fk.initial_bird_count || 0,
          crates: Number(f.crates) || 0,
          pieces: Number(f.pieces) || 0,
          _is_opening: true,
        })
      }
      setShowOpeningModal(false)
      load()
    } finally { setSaving(false) }
  }

  const previewEggs = form.crates !== '' ? Number(form.crates) * 30 + Number(form.pieces || 0) : null
  const previewYield = previewEggs != null && Number(form.no_of_birds) > 0
    ? ((previewEggs / Number(form.no_of_birds)) * 100).toFixed(1) + '%'
    : null

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '60px 24px', color: 'var(--color-text-secondary)', fontSize: 14 }}>
      <div style={{ width: 20, height: 20, border: '2px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <span>Loading production…</span>
    </div>
  )

  return (
    <div className={styles.page}>
      {/* Stats row */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total Eggs</div>
          <div className={styles.statValue}>{formatEggs(totalEggs)}</div>
          <div className={styles.statSub}>{records.length} records</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Avg Daily Yield</div>
          <div className={styles.statValue}>{avgYield}%</div>
          <div className={styles.statSub}>production rate</div>
        </div>
        {byFlock.map(bf => (
          <div key={bf.flock.id} className={styles.statCard} style={{ borderTop: `3px solid ${bf.flock.color || '#2563eb'}` }}>
            <div className={styles.statLabel}>{bf.flock.name}</div>
            <div className={styles.statValue}>{formatEggs(bf.eggs)}</div>
            <div className={styles.statSub}>{bf.records} records</div>
          </div>
        ))}
      </div>

      {/* Lifecycle alerts */}
      {lifecycleAlerts.map(({ flock, daysLeft }) => (
        <div key={flock.id} className={`${styles.alert} ${daysLeft <= 14 ? styles.alertRed : styles.alertAmber}`}>
          <span className={styles.alertIcon}>{daysLeft <= 0 ? '🔴' : '⚠️'}</span>
          <span className={styles.alertText}>
            <strong>{flock.name}</strong> {daysLeft <= 0
              ? ` passed expected retirement date ${Math.abs(daysLeft)} days ago.`
              : ` retirement in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} (${flock.expected_retirement}).`}
          </span>
          <button className={styles.alertDismiss} onClick={() => setDismissedAlerts(d => [...d, flock.id])}>✕</button>
        </div>
      ))}

      {/* Toolbar */}
      <div className={styles.toolbar}>
        {can('write') && (
          <>
            <Button onClick={openAdd}>+ Add Record</Button>
            <Button variant="secondary" onClick={() => setShowOpeningModal(true)}>Set Opening Stock</Button>
          </>
        )}
        <span className={styles.recordCount}>{records.length} record{records.length !== 1 ? 's' : ''} this month</span>
      </div>

      {/* Records */}
      <div className={styles.tableWrapper}>
        {records.length === 0
          ? <div className={styles.empty}>No production records for this month.</div>
          : records.map(row => {
            const fk = row.flocks || flocks.find(f => f.id === row.flock_id)
            const eggs = (row.crates || 0) * 30 + (row.pieces || 0)
            const yieldPct = row.daily_yield_pct != null ? row.daily_yield_pct.toFixed(1) + '%' : null
            const yieldColor = row.daily_yield_pct >= 80 ? '#16a34a' : row.daily_yield_pct >= 60 ? '#d97706' : '#dc2626'
            return (
              <div key={row.id} className={styles.recordCard}>
                <div className={styles.recordCardTop}>
                  <div className={styles.recordCardLeft}>
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{formatDate(row.date)}</span>
                    {fk && (
                      <span className={styles.flockBadge} style={{ borderColor: fk.color || '#e2e8f0', color: fk.color || '#475569', background: (fk.color || '#475569') + '18' }}>
                        {fk.name}
                      </span>
                    )}
                  </div>
                  <div className={styles.recordCardRight}>
                    <span className={styles.eggCount}>{formatEggs(eggs)}</span>
                    {yieldPct && <span style={{ fontSize: 13, fontWeight: 600, color: yieldColor }}>{yieldPct}</span>}
                    {can('write') && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>Edit</Button>
                        <Button size="sm" variant="danger" onClick={() => handleDelete(row.id)}>Del</Button>
                      </div>
                    )}
                  </div>
                </div>
                <div className={styles.recordDetails}>
                  {row.crates} crates · {row.pieces} pcs
                  {row.no_of_birds ? ` · ${row.no_of_birds} birds` : ''}
                </div>
              </div>
            )
          })
        }
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal title={editRecord ? 'Edit Production Record' : 'Add Production Record'} onClose={() => setShowModal(false)}
          footer={<><Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button><Button onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button></>}
        >
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.formGrid}>
              <FormField label="Date">
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
              </FormField>
              <FormField label="Flock">
                <Sel value={form.flock_id}
                  onChange={e => {
                    const id = e.target.value
                    const fk = flocks.find(f => String(f.id) === String(id))
                    setForm(f => ({ ...f, flock_id: id, no_of_birds: fk ? String(liveBirdCounts[fk.id] || fk.initial_bird_count || '') : '' }))
                  }}>
                  <option value="">— Select flock —</option>
                  {flocks.map(fk => <option key={fk.id} value={fk.id}>{fk.name}</option>)}
                </Sel>
              </FormField>
              <FormField label="No. of Birds" hint="Auto-filled from live bird count">
                <Input type="number" min="0" value={form.no_of_birds} onChange={e => setForm(f => ({ ...f, no_of_birds: e.target.value }))} />
              </FormField>
              <FormField label="Crates">
                <Input type="number" min="0" value={form.crates} onChange={e => setForm(f => ({ ...f, crates: e.target.value }))} required />
              </FormField>
              <FormField label="Pieces (0–29)">
                <Input type="number" min="0" max="29" value={form.pieces} onChange={e => setForm(f => ({ ...f, pieces: e.target.value }))} required />
              </FormField>
            </div>
            {previewEggs != null && (
              <div className={styles.preview}>
                Total: <strong>{formatEggs(previewEggs)}</strong>
                {previewYield && <> &nbsp;·&nbsp; Yield: <strong>{previewYield}</strong></>}
              </div>
            )}
          </form>
        </Modal>
      )}

      {/* Opening Stock Modal */}
      {showOpeningModal && (
        <Modal title="Set Opening Stock" onClose={() => setShowOpeningModal(false)}
          footer={<><Button variant="secondary" onClick={() => setShowOpeningModal(false)}>Cancel</Button><Button onClick={handleOpeningSubmit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button></>}
        >
          <form onSubmit={handleOpeningSubmit} className={styles.form}>
            <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
              Enter opening egg stock for the beginning of {monthYear}. Leave blank to skip a flock.
            </div>
            {flocks.map(fk => (
              <div key={fk.id}>
                <div style={{ fontSize: 13, fontWeight: 700, color: fk.color || 'var(--color-text)', marginBottom: 8 }}>{fk.name}</div>
                <div className={styles.formGrid}>
                  <FormField label="Crates">
                    <Input type="number" min="0" placeholder="0"
                      value={openingForms[fk.id]?.crates || ''}
                      onChange={e => setOpeningForms(of => ({ ...of, [fk.id]: { ...of[fk.id], crates: e.target.value } }))} />
                  </FormField>
                  <FormField label="Pieces">
                    <Input type="number" min="0" max="29" placeholder="0"
                      value={openingForms[fk.id]?.pieces || ''}
                      onChange={e => setOpeningForms(of => ({ ...of, [fk.id]: { ...of[fk.id], pieces: e.target.value } }))} />
                  </FormField>
                </div>
              </div>
            ))}
          </form>
        </Modal>
      )}
    </div>
  )
}
