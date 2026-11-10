import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useMonth } from '../utils/MonthContext'
import { useAuth } from '../utils/AuthContext'
import { formatDate, toMonthYear, MORTALITY_REASONS, REASON_ICONS } from '../utils/format'
import Modal from '../components/common/Modal'
import Button from '../components/common/Button'
import FormField from '../components/common/FormField'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import styles from './Mortality.module.css'
import dayjs from 'dayjs'

const REASON_COLORS = {
  Disease: '#dc2626', Injury: '#f97316', 'Heat Stress': '#eab308', Unknown: '#6b7280',
  Sale: '#16a34a', Domestic: '#0891b2', Gift: '#8b5cf6', Cull: '#374151', Transfer: '#2563eb', Other: '#94a3b8',
}
const PIE_COLORS = Object.values(REASON_COLORS)

const EMPTY_FORM = {
  date: dayjs().format('YYYY-MM-DD'),
  flock_id: '',
  count: '',
  reason: 'Disease',
  notes: '',
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

export default function Mortality() {
  const { monthYear } = useMonth()
  const { can } = useAuth()

  const [records, setRecords] = useState([])
  const [flocks, setFlocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editRecord, setEditRecord] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [recRes, fkRes, allMovRes] = await Promise.all([
        supabase.from('flock_movements').select('*, flocks(name, color)').eq('month_year', monthYear).order('date', { ascending: false }),
        supabase.from('flocks').select('*').eq('is_active', true).order('name'),
        supabase.from('flock_movements').select('flock_id, count'),
      ])
      setRecords(recRes.data || [])
      const fks = fkRes.data || []
      const allMov = allMovRes.data || []
      const enriched = fks.map(fk => {
        const removed = allMov.filter(m => m.flock_id === fk.id).reduce((s, m) => s + (m.count || 0), 0)
        const live = Math.max(0, (fk.initial_birds || 0) - removed)
        const age_weeks = fk.date_acquired ? dayjs().diff(dayjs(fk.date_acquired), 'week') : null
        return { ...fk, live_birds: live, removed_total: removed, age_weeks }
      })
      setFlocks(enriched)
    } finally { setLoading(false) }
  }, [monthYear])

  useEffect(() => { load() }, [load])

  const totalThisMonth = records.reduce((s, r) => s + (r.count || 0), 0)
  const byReason = records.reduce((acc, r) => { acc[r.reason] = (acc[r.reason] || 0) + (r.count || 0); return acc }, {})
  const pieData = Object.entries(byReason).map(([name, value]) => ({ name, value }))

  function openAdd() {
    setEditRecord(null)
    setForm({ ...EMPTY_FORM, date: dayjs().format('YYYY-MM-DD'), flock_id: flocks[0]?.id || '' })
    setShowModal(true)
  }

  function openEdit(row) {
    setEditRecord(row)
    setForm({ date: row.date, flock_id: row.flock_id, count: String(row.count || ''), reason: row.reason, notes: row.notes || '' })
    setShowModal(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const data = { date: form.date, month_year: toMonthYear(form.date), flock_id: Number(form.flock_id), count: Number(form.count), reason: form.reason, notes: form.notes || null }
      if (editRecord) await supabase.from('flock_movements').update(data).eq('id', editRecord.id)
      else await supabase.from('flock_movements').insert(data)
      setShowModal(false)
      load()
    } finally { setSaving(false) }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this movement record?')) return
    await supabase.from('flock_movements').delete().eq('id', id)
    load()
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '60px 24px', color: 'var(--color-text-secondary)', fontSize: 14 }}>
      <div style={{ width: 20, height: 20, border: '2px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <span>Loading…</span>
    </div>
  )

  return (
    <div className={styles.page}>
      {/* Bird count cards */}
      <div className={styles.birdGrid}>
        {flocks.map(fk => {
          const removedPct = fk.initial_birds > 0 ? Math.min(100, (fk.removed_total / fk.initial_birds) * 100) : 0
          return (
            <div key={fk.id} className={styles.birdCard} style={{ borderTopColor: fk.color || '#dc2626' }}>
              <div className={styles.birdCardHeader}>
                <div className={styles.birdDot} style={{ background: fk.color || '#dc2626' }} />
                <div className={styles.birdName}>{fk.name}</div>
                {fk.age_weeks != null && <div className={styles.birdAge}>{fk.age_weeks}w old</div>}
              </div>
              <div className={styles.birdStats}>
                <div className={styles.birdStat}>
                  <div className={styles.birdStatValue} style={{ color: '#16a34a' }}>{fk.live_birds.toLocaleString()}</div>
                  <div className={styles.birdStatLabel}>Live</div>
                </div>
                <div className={styles.birdStat}>
                  <div className={styles.birdStatValue} style={{ color: '#dc2626' }}>{fk.removed_total.toLocaleString()}</div>
                  <div className={styles.birdStatLabel}>Removed</div>
                </div>
                <div className={styles.birdStat}>
                  <div className={styles.birdStatValue}>{removedPct.toFixed(1)}%</div>
                  <div className={styles.birdStatLabel}>Reduction</div>
                </div>
              </div>
              <div className={styles.birdProgress}>
                <div className={styles.birdProgressFill} style={{ width: `${100 - removedPct}%`, background: fk.color || '#16a34a' }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary + pie */}
      <div className={styles.summaryRow}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Removed This Month</div>
          <div className={styles.summaryValue} style={{ color: '#dc2626' }}>{totalThisMonth}</div>
          <div className={styles.summarySub}>{records.length} records</div>
        </div>
        {pieData.length > 0 && (
          <div className={styles.pieCard}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>By Reason</div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 120 }}>
                {pieData.map(d => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 16 }}>{REASON_ICONS[d.name] || '•'}</span>
                    <span style={{ flex: 1, fontSize: 13, color: '#374151' }}>{d.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: REASON_COLORS[d.name] || '#6b7280' }}>{d.value}</span>
                  </div>
                ))}
              </div>
              <div style={{ width: 130, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height={120}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={3}>
                      {pieData.map((d, i) => <Cell key={i} fill={REASON_COLORS[d.name] || PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [v, n]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        {can('write') && <Button onClick={openAdd}>+ Record Movement</Button>}
        <span className={styles.recordCount}>{records.length} record{records.length !== 1 ? 's' : ''} this month</span>
      </div>

      {/* Records */}
      <div className={styles.tableWrapper}>
        {records.length === 0
          ? <div className={styles.empty}>No flock movement records this month.</div>
          : records.map(row => {
            const fk = row.flocks || flocks.find(f => f.id === row.flock_id)
            const icon = REASON_ICONS[row.reason] || '•'
            const color = REASON_COLORS[row.reason] || '#6b7280'
            const isDeath = ['Disease', 'Injury', 'Heat Stress', 'Unknown'].includes(row.reason)
            return (
              <div key={row.id} className={styles.recordCard}>
                <div className={styles.recordCardTop}>
                  <div className={styles.recordCardLeft}>
                    <span style={{ display: 'inline-block', background: color + '1a', color, borderRadius: 100, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>{icon} {row.reason}</span>
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{formatDate(row.date)}</span>
                    {fk && <span style={{ display: 'inline-block', border: `1px solid ${fk.color || '#e2e8f0'}`, borderRadius: 100, padding: '3px 10px', fontSize: 12, fontWeight: 600, color: fk.color || '#475569', background: (fk.color || '#475569') + '18' }}>{fk.name}</span>}
                  </div>
                  <div className={styles.recordCardRight}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: isDeath ? '#dc2626' : '#16a34a' }}>{isDeath ? '−' : '↗'}{row.count}</span>
                    {can('write') && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>Edit</Button>
                        <Button size="sm" variant="danger" onClick={() => handleDelete(row.id)}>Del</Button>
                      </div>
                    )}
                  </div>
                </div>
                {row.notes && <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{row.notes}</div>}
              </div>
            )
          })
        }
      </div>

      {/* Modal */}
      {showModal && (
        <Modal title={editRecord ? 'Edit Movement Record' : 'Record Flock Movement'} onClose={() => setShowModal(false)}
          footer={<><Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button><Button onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button></>}
        >
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.formGrid}>
              <FormField label="Date">
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
              </FormField>
              <FormField label="Flock">
                <Sel value={form.flock_id} onChange={e => setForm(f => ({ ...f, flock_id: e.target.value }))} required>
                  <option value="">— Select flock —</option>
                  {flocks.map(fk => <option key={fk.id} value={fk.id}>{fk.name} ({fk.live_birds} live)</option>)}
                </Sel>
              </FormField>
              <FormField label="Count (birds)">
                <Input type="number" min="1" value={form.count} onChange={e => setForm(f => ({ ...f, count: e.target.value }))} required />
              </FormField>
              <FormField label="Reason">
                <Sel value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}>
                  {MORTALITY_REASONS.map(r => <option key={r} value={r}>{REASON_ICONS[r] || ''} {r}</option>)}
                </Sel>
              </FormField>
            </div>
            <FormField label="Notes">
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
            </FormField>
          </form>
        </Modal>
      )}
    </div>
  )
}
