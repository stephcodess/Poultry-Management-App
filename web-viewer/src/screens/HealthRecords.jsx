import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useMonth } from '../utils/MonthContext'
import { useAuth } from '../utils/AuthContext'
import { formatDate, formatCurrency, toMonthYear } from '../utils/format'
import Modal from '../components/common/Modal'
import Button from '../components/common/Button'
import FormField from '../components/common/FormField'
import styles from './HealthRecords.module.css'
import dayjs from 'dayjs'

const RECORD_TYPES = ['Vaccination', 'Medication', 'Deworming', 'Vitamin Supplement', 'Vet Visit', 'Other']

const EMPTY_FORM = {
  date: dayjs().format('YYYY-MM-DD'),
  flock_id: '',
  record_type: 'Vaccination',
  name: '',
  dosage: '',
  administered_by: '',
  cost: '',
  next_due_date: '',
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

function daysUntil(dateStr) {
  const diff = dayjs(dateStr).diff(dayjs().startOf('day'), 'day')
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff < 0) return `${Math.abs(diff)}d overdue`
  return `In ${diff} days`
}

function urgencyColor(dateStr) {
  const diff = dayjs(dateStr).diff(dayjs().startOf('day'), 'day')
  if (diff <= 3) return '#dc2626'
  if (diff <= 7) return '#d97706'
  return '#16a34a'
}

export default function HealthRecords() {
  const { monthYear } = useMonth()
  const { can } = useAuth()

  const [records, setRecords] = useState([])
  const [upcoming, setUpcoming] = useState([])
  const [flocks, setFlocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [showModal, setShowModal] = useState(false)
  const [editRecord, setEditRecord] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [filterFlock, setFilterFlock] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const today = dayjs().format('YYYY-MM-DD')
      const in30 = dayjs().add(30, 'day').format('YYYY-MM-DD')
      const [recRes, upRes, fkRes] = await Promise.all([
        supabase.from('health_records').select('*, flocks(name, color)').eq('month_year', monthYear).order('date', { ascending: false }),
        supabase.from('health_records').select('*, flocks(name, color)').gte('next_due_date', today).lte('next_due_date', in30).order('next_due_date'),
        supabase.from('flocks').select('*').neq('is_active', 0).order('name'),
      ])
      setRecords(recRes.data || [])
      setUpcoming(upRes.data || [])
      setFlocks(fkRes.data || [])
    } finally { setLoading(false) }
  }, [monthYear])

  useEffect(() => { load() }, [load])

  const totalCost = records.reduce((s, r) => s + (r.cost || 0), 0)

  const hasFilters = filterFlock || filterType || filterDateFrom || filterDateTo
  const filtered = records.filter(r => {
    if (filterFlock && String(r.flock_id) !== filterFlock) return false
    if (filterType && r.record_type !== filterType) return false
    if (filterDateFrom && r.date < filterDateFrom) return false
    if (filterDateTo && r.date > filterDateTo) return false
    return true
  })

  function openAdd() {
    setEditRecord(null)
    setForm({ ...EMPTY_FORM, date: dayjs().format('YYYY-MM-DD'), flock_id: flocks[0]?.id || '' })
    setShowModal(true)
  }

  function openEdit(row) {
    setEditRecord(row)
    setForm({
      date: row.date, flock_id: row.flock_id, record_type: row.record_type,
      name: row.name || '', dosage: row.dosage || '', administered_by: row.administered_by || '',
      cost: row.cost != null ? String(row.cost) : '', next_due_date: row.next_due_date || '',
      notes: row.notes || '',
    })
    setShowModal(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const data = {
        date: form.date, month_year: toMonthYear(form.date),
        flock_id: form.flock_id ? Number(form.flock_id) : null,
        record_type: form.record_type, name: form.name || null,
        dosage: form.dosage || null, administered_by: form.administered_by || null,
        cost: form.cost ? Number(form.cost) : null,
        next_due_date: form.next_due_date || null, notes: form.notes || null,
      }
      if (editRecord) await supabase.from('health_records').update(data).eq('id', editRecord.id)
      else await supabase.from('health_records').insert(data)
      setShowModal(false)
      load()
    } finally { setSaving(false) }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this health record?')) return
    await supabase.from('health_records').delete().eq('id', id)
    load()
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '60px 24px', color: 'var(--color-text-secondary)', fontSize: 14 }}>
      <div style={{ width: 20, height: 20, border: '2px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <span>Loading health records…</span>
    </div>
  )

  return (
    <div className={styles.page}>
      {/* Upcoming due dates */}
      {upcoming.length > 0 && (
        <div className={styles.upcomingSection}>
          <div className={styles.upcomingTitle}>⏰ Upcoming Due Dates ({upcoming.length})</div>
          {upcoming.map(r => {
            const color = urgencyColor(r.next_due_date)
            const fk = r.flocks
            return (
              <div key={r.id} className={styles.upcomingItem} style={{ borderLeftColor: color }}>
                <div className={styles.upcomingLeft}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name || r.record_type}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{fk?.name || 'All Flocks'} · {r.record_type}</div>
                </div>
                <div className={styles.upcomingDue} style={{ color }}>{daysUntil(r.next_due_date)}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Stats */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total Health Cost</div>
          <div className={styles.statValue} style={{ color: '#dc2626' }}>{formatCurrency(totalCost)}</div>
          <div className={styles.statSub}>{records.length} records this month</div>
        </div>
        {RECORD_TYPES.map(type => {
          const count = records.filter(r => r.record_type === type).length
          if (count === 0) return null
          return (
            <div key={type} className={styles.statCard}>
              <div className={styles.statLabel}>{type}</div>
              <div className={styles.statValue}>{count}</div>
              <div className={styles.statSub}>records</div>
            </div>
          )
        })}
      </div>

      {/* Toolbar + Filters */}
      <div className={styles.toolbar}>
        {can('write') && <Button onClick={openAdd}>+ Add Health Record</Button>}
        {hasFilters && <button className={styles.clearBtn} onClick={() => { setFilterFlock(''); setFilterType(''); setFilterDateFrom(''); setFilterDateTo('') }}>✕ Clear Filters</button>}
      </div>

      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Flock</label>
          <select className={styles.filterInput} value={filterFlock} onChange={e => setFilterFlock(e.target.value)}>
            <option value="">All Flocks</option>
            {flocks.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Type</label>
          <select className={styles.filterInput} value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">All Types</option>
            {RECORD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>From</label>
          <input type="date" className={styles.filterInput} value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>To</label>
          <input type="date" className={styles.filterInput} value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
        </div>
      </div>

      {/* Records */}
      <div className={styles.tableWrapper}>
        {filtered.length === 0
          ? <div className={styles.empty}>{hasFilters ? 'No records match the filters.' : 'No health records for this month.'}</div>
          : filtered.map(row => {
            const fk = row.flocks
            const color = row.next_due_date ? urgencyColor(row.next_due_date) : null
            return (
              <div key={row.id} className={styles.recordCard}>
                <div className={styles.recordCardTop}>
                  <div className={styles.recordCardLeft}>
                    <span className={styles.typeBadge}>{row.record_type}</span>
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{formatDate(row.date)}</span>
                    {fk && <span className={styles.flockBadge} style={{ borderColor: fk.color || '#e2e8f0', color: fk.color || '#475569', background: (fk.color || '#475569') + '18' }}>{fk.name}</span>}
                  </div>
                  <div className={styles.recordCardRight}>
                    {row.cost != null && <span className={styles.costCell}>{formatCurrency(row.cost)}</span>}
                    {row.next_due_date && <span style={{ fontSize: 12, fontWeight: 600, color }}>{daysUntil(row.next_due_date)}</span>}
                    {can('write') && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>Edit</Button>
                        <Button size="sm" variant="danger" onClick={() => handleDelete(row.id)}>Del</Button>
                      </div>
                    )}
                  </div>
                </div>
                <div className={styles.recordDetails}>
                  {row.name && <strong>{row.name}</strong>}
                  {row.dosage && <> · {row.dosage}</>}
                  {row.administered_by && <> · by {row.administered_by}</>}
                  {row.next_due_date && <> · Next: {formatDate(row.next_due_date)}</>}
                </div>
                {row.notes && <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{row.notes}</div>}
              </div>
            )
          })
        }
      </div>

      {/* Modal */}
      {showModal && (
        <Modal title={editRecord ? 'Edit Health Record' : 'Add Health Record'} onClose={() => setShowModal(false)}
          footer={<><Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button><Button onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button></>}
        >
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.formGrid}>
              <FormField label="Date">
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
              </FormField>
              <FormField label="Flock">
                <Sel value={form.flock_id} onChange={e => setForm(f => ({ ...f, flock_id: e.target.value }))}>
                  <option value="">All Flocks</option>
                  {flocks.map(fk => <option key={fk.id} value={fk.id}>{fk.name}</option>)}
                </Sel>
              </FormField>
              <FormField label="Record Type">
                <Sel value={form.record_type} onChange={e => setForm(f => ({ ...f, record_type: e.target.value }))}>
                  {RECORD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </Sel>
              </FormField>
              <FormField label="Product / Name">
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Newcastle vaccine" />
              </FormField>
              <FormField label="Dosage">
                <Input value={form.dosage} onChange={e => setForm(f => ({ ...f, dosage: e.target.value }))} placeholder="e.g. 2ml per bird" />
              </FormField>
              <FormField label="Administered By">
                <Input value={form.administered_by} onChange={e => setForm(f => ({ ...f, administered_by: e.target.value }))} placeholder="Vet or staff name" />
              </FormField>
              <FormField label="Cost (₦)">
                <Input type="number" min="0" step="0.01" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} placeholder="0" />
              </FormField>
              <FormField label="Next Due Date">
                <Input type="date" value={form.next_due_date} onChange={e => setForm(f => ({ ...f, next_due_date: e.target.value }))} />
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
