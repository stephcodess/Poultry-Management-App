import React, { useEffect, useState, useCallback } from 'react'
import { useMonth } from '../utils/MonthContext'
import { formatDate, toMonthYear } from '../utils/format'
import Table from '../components/common/Table'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import StatCard from '../components/common/StatCard'
import FormField, { Input, Select } from '../components/common/FormField'
import styles from './Screen.module.css'
import dayjs from 'dayjs'

const FEED_TYPES = ['Layers Mash', 'Layers Pellet', 'Chick Mash', 'Grower Mash', 'Concentrate', 'Other']

const EMPTY_FORM = {
  date: dayjs().format('YYYY-MM-DD'),
  flock_id: '',
  feed_type: 'Layers Mash',
  quantity_kg: '',
  notes: '',
}

export default function FeedLog() {
  const { monthYear } = useMonth()
  const [records, setRecords] = useState([])
  const [summary, setSummary] = useState(null)
  const [stock, setStock] = useState(null)
  const [flocks, setFlocks] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editRecord, setEditRecord] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const load = useCallback(async () => {
    const [r, s, f, st] = await Promise.all([
      window.api.feed.getAll(monthYear),
      window.api.feed.getSummary(monthYear),
      window.api.flocks.getAll(),
      window.api.feed.getStock(),
    ])
    setRecords(r)
    setSummary(s)
    setFlocks(f)
    setStock(st)
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
      date: row.date, flock_id: row.flock_id || '', feed_type: row.feed_type,
      quantity_kg: row.quantity_kg, notes: row.notes || '',
    })
    setShowModal(true)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this feed record?')) return
    await window.api.feed.delete(id)
    load()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const data = {
      ...form,
      month_year: toMonthYear(form.date),
      flock_id: form.flock_id ? Number(form.flock_id) : null,
      quantity_kg: Number(form.quantity_kg),
    }
    if (editRecord) {
      await window.api.feed.update(editRecord.id, data)
    } else {
      await window.api.feed.add(data)
    }
    setShowModal(false)
    load()
  }

  const totalKgUsed = summary?.totals?.total_kg || 0
  const stockOnHand = stock?.stockOnHandKg || 0
  const totalPurchased = stock?.totalPurchasedKg || 0

  const columns = [
    { key: 'date', label: 'Date', render: v => formatDate(v) },
    {
      key: 'flock_name', label: 'Flock',
      render: (v, row) => v ? (
        <span className={styles.flockBadge} style={{ background: (row.flock_color || '#2563eb') + '22', color: row.flock_color || '#2563eb', borderColor: (row.flock_color || '#2563eb') + '55' }}>
          {v}
        </span>
      ) : <span style={{ color: 'var(--color-text-muted)' }}>All Flocks</span>
    },
    { key: 'feed_type', label: 'Feed Type', render: v => <span className={styles.badge}>{v}</span> },
    { key: 'quantity_kg', label: 'Consumed (kg)', align: 'right', render: v => `${v} kg` },
    { key: 'notes', label: 'Notes', render: v => v || '—' },
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
      <div className={styles.statsRow}>
        <StatCard label="Stock on Hand" value={`${stockOnHand.toFixed(1)} kg`} icon="🌾" accent="primary"
          sub={`${totalPurchased.toFixed(1)} kg purchased all-time`} />
        <StatCard label="Used This Month" value={`${totalKgUsed.toFixed(1)} kg`} icon="📉" accent="danger" />
        {(summary?.byType || []).map(t => (
          <StatCard key={t.feed_type} label={t.feed_type} value={`${(t.total_kg || 0).toFixed(1)} kg`} />
        ))}
      </div>

      {/* Stock breakdown by type */}
      {(stock?.byType || []).length > 0 && (
        <div className={styles.pieCard}>
          <div className={styles.domSectionTitle}>Stock by Feed Type</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '4px 0' }}>
            {stock.byType.map(t => (
              <div key={t.feed_type} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 140, background: '#f9fafb', borderRadius: 8, padding: '10px 14px', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t.feed_type}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>{t.stock_kg.toFixed(1)} kg</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{t.purchased_kg.toFixed(1)} in · {t.consumed_kg.toFixed(1)} used</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.toolbar}>
        <Button onClick={openAdd}>+ Log Feed Usage</Button>
        <span className={styles.recordCount}>{records.length} record{records.length !== 1 ? 's' : ''} this month</span>
      </div>

      <Table columns={columns} data={records} emptyMessage="No feed usage recorded this month." />

      {showModal && (
        <Modal
          title={editRecord ? 'Edit Feed Usage' : 'Log Feed Usage'}
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
              <FormField label="Flock (leave blank for all)">
                <Select value={form.flock_id}
                  onChange={e => setForm(f => ({ ...f, flock_id: e.target.value }))}>
                  <option value="">All Flocks</option>
                  {flocks.map(fk => <option key={fk.id} value={fk.id}>{fk.name}</option>)}
                </Select>
              </FormField>
              <FormField label="Feed Type">
                <Select value={form.feed_type}
                  onChange={e => setForm(f => ({ ...f, feed_type: e.target.value }))}>
                  {FEED_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </Select>
              </FormField>
              <FormField label="Quantity Used (kg)">
                <Input type="number" min="0" step="0.1" value={form.quantity_kg}
                  onChange={e => setForm(f => ({ ...f, quantity_kg: e.target.value }))} required />
              </FormField>
            </div>
            <FormField label="Notes">
              <Input type="text" placeholder="Optional notes"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </FormField>
          </form>
        </Modal>
      )}
    </div>
  )
}
