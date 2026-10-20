import React, { useEffect, useState, useCallback } from 'react'
import { useMonth } from '../utils/MonthContext'
import { formatDate, formatCurrency, toMonthYear } from '../utils/format'
import Table from '../components/common/Table'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import StatCard from '../components/common/StatCard'
import FormField, { Input, Select } from '../components/common/FormField'
import styles from './Screen.module.css'
import hStyles from './HealthRecords.module.css'
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

export default function HealthRecords() {
  const { monthYear } = useMonth()
  const [records, setRecords] = useState([])
  const [upcoming, setUpcoming] = useState([])
  const [summary, setSummary] = useState(null)
  const [flocks, setFlocks] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editRecord, setEditRecord] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [filterFlock, setFilterFlock] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  const load = useCallback(async () => {
    const [r, u, s, f] = await Promise.all([
      window.api.health.getAll(monthYear),
      window.api.health.getUpcoming(),
      window.api.health.getSummary(monthYear),
      window.api.flocks.getAll(),
    ])
    setRecords(r)
    setUpcoming(u)
    setSummary(s)
    setFlocks(f)
  }, [monthYear])

  useEffect(() => { load() }, [load])

  function openAdd() {
    setEditRecord(null)
    setForm({ ...EMPTY_FORM, flock_id: flocks[0]?.id || '', date: dayjs().format('YYYY-MM-DD') })
    setShowModal(true)
  }

  function openEdit(row) {
    setEditRecord(row)
    setForm({
      date: row.date, flock_id: row.flock_id, record_type: row.record_type,
      name: row.name, dosage: row.dosage || '', administered_by: row.administered_by || '',
      cost: row.cost, next_due_date: row.next_due_date || '', notes: row.notes || '',
    })
    setShowModal(true)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this health record?')) return
    await window.api.health.delete(id)
    load()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const data = {
      ...form,
      month_year: toMonthYear(form.date),
      flock_id: form.flock_id ? Number(form.flock_id) : null,
      cost: Number(form.cost) || 0,
      next_due_date: form.next_due_date || null,
    }
    if (editRecord) {
      await window.api.health.update(editRecord.id, data)
    } else {
      await window.api.health.add(data)
    }
    setShowModal(false)
    load()
  }

  const daysUntil = (dateStr) => {
    const days = dayjs(dateStr).diff(dayjs(), 'day')
    if (days === 0) return 'Today'
    if (days === 1) return 'Tomorrow'
    return `In ${days} days`
  }

  const urgencyColor = (dateStr) => {
    const days = dayjs(dateStr).diff(dayjs(), 'day')
    if (days <= 3) return '#dc2626'
    if (days <= 7) return '#d97706'
    return '#16a34a'
  }

  const filteredRecords = records.filter(r => {
    if (filterFlock && String(r.flock_id) !== filterFlock) return false
    if (filterType && r.record_type !== filterType) return false
    if (filterDateFrom && r.date < filterDateFrom) return false
    if (filterDateTo && r.date > filterDateTo) return false
    return true
  })

  const hasFilter = filterFlock || filterType || filterDateFrom || filterDateTo

  const columns = [
    { key: 'date', label: 'Date', render: v => formatDate(v) },
    { key: 'flock_name', label: 'Flock', render: (v, row) => v ? (
      <span className={styles.flockBadge} style={{ background: (row.flock_color || '#2563eb') + '22', color: row.flock_color || '#2563eb', borderColor: (row.flock_color || '#2563eb') + '55' }}>
        {v}
      </span>
    ) : <span style={{ color: 'var(--color-text-muted)' }}>All Flocks</span> },
    { key: 'record_type', label: 'Type', render: v => <span className={styles.badge}>{v}</span> },
    { key: 'name', label: 'Name / Product' },
    { key: 'dosage', label: 'Dosage' },
    { key: 'administered_by', label: 'By' },
    { key: 'cost', label: 'Cost', align: 'right', render: v => v > 0 ? formatCurrency(v) : '—' },
    { key: 'next_due_date', label: 'Next Due', render: v => v ? (
      <span style={{ color: urgencyColor(v), fontWeight: 600, fontSize: 12 }}>
        {formatDate(v)}
      </span>
    ) : '—' },
    {
      key: 'actions', label: '', align: 'right', width: 110,
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>Edit</Button>
          <Button size="sm" variant="danger" onClick={() => handleDelete(row.id)}>Del</Button>
        </div>
      )
    },
  ]

  return (
    <div className={styles.page}>
      {/* Upcoming alerts */}
      {upcoming.length > 0 && (
        <div className={hStyles.upcomingSection}>
          <div className={hStyles.upcomingTitle}>⏰ Upcoming Due Dates</div>
          <div className={hStyles.upcomingList}>
            {upcoming.map(u => (
              <div key={u.id} className={hStyles.upcomingItem} style={{ borderLeftColor: urgencyColor(u.next_due_date) }}>
                <div className={hStyles.upcomingLeft}>
                  <span className={hStyles.upcomingName}>{u.name}</span>
                  <span className={hStyles.upcomingFlock}>{u.flock_name || 'All Flocks'} · {u.record_type}</span>
                </div>
                <span className={hStyles.upcomingDue} style={{ color: urgencyColor(u.next_due_date) }}>
                  {daysUntil(u.next_due_date)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div className={styles.statsRow}>
        <StatCard label="Total Health Cost" value={formatCurrency(summary?.totalCost || 0)} icon="🏥" accent="warning" />
        {(summary?.byType || []).map(t => (
          <StatCard key={t.record_type} label={t.record_type}
            value={`${t.count} records`} sub={formatCurrency(t.total_cost)} />
        ))}
      </div>

      <div className={styles.toolbar}>
        <Button onClick={openAdd}>+ Add Health Record</Button>
        <Select value={filterFlock} onChange={e => setFilterFlock(e.target.value)} style={{ minWidth: 150 }}>
          <option value="">All Flocks</option>
          {flocks.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </Select>
        <Select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ minWidth: 160 }}>
          <option value="">All Types</option>
          {RECORD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </Select>
        <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
          title="From date" style={{ width: 145 }} />
        <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
          title="To date" style={{ width: 145 }} />
        {hasFilter && (
          <Button variant="secondary" onClick={() => {
            setFilterFlock(''); setFilterType(''); setFilterDateFrom(''); setFilterDateTo('')
          }}>
            Clear filters
          </Button>
        )}
      </div>

      <Table columns={columns} data={filteredRecords} emptyMessage="No health records match the selected filters." />

      {showModal && (
        <Modal
          title={editRecord ? 'Edit Health Record' : 'Add Health Record'}
          onClose={() => setShowModal(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button onClick={handleSubmit}>Save</Button>
            </>
          }
        >
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.formGrid}>
              <FormField label="Date">
                <Input type="date" value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
              </FormField>
              <FormField label="Flock">
                <Select value={form.flock_id}
                  onChange={e => setForm(f => ({ ...f, flock_id: e.target.value }))}>
                  <option value="">All Flocks</option>
                  {flocks.map(fk => <option key={fk.id} value={fk.id}>{fk.name}</option>)}
                </Select>
              </FormField>
              <FormField label="Type">
                <Select value={form.record_type}
                  onChange={e => setForm(f => ({ ...f, record_type: e.target.value }))}>
                  {RECORD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </Select>
              </FormField>
              <FormField label="Name / Product">
                <Input type="text" placeholder="e.g. Newcastle Vaccine, Tylosin"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </FormField>
              <FormField label="Dosage">
                <Input type="text" placeholder="e.g. 1ml per bird"
                  value={form.dosage}
                  onChange={e => setForm(f => ({ ...f, dosage: e.target.value }))} />
              </FormField>
              <FormField label="Administered By">
                <Input type="text" placeholder="e.g. Vet, Farm Manager"
                  value={form.administered_by}
                  onChange={e => setForm(f => ({ ...f, administered_by: e.target.value }))} />
              </FormField>
              <FormField label="Cost (₦)">
                <Input type="number" min="0" value={form.cost}
                  onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} />
              </FormField>
              <FormField label="Next Due Date">
                <Input type="date" value={form.next_due_date}
                  onChange={e => setForm(f => ({ ...f, next_due_date: e.target.value }))} />
              </FormField>
            </div>
            <FormField label="Notes">
              <Input type="text" placeholder="Additional observations…"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </FormField>
          </form>
        </Modal>
      )}
    </div>
  )
}
