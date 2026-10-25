import React, { useEffect, useState, useCallback } from 'react'
import PageLoader from '../components/common/PageLoader'
import { useMonth } from '../utils/MonthContext'
import { formatDate, toMonthYear } from '../utils/format'
import Table from '../components/common/Table'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import StatCard from '../components/common/StatCard'
import FormField, { Input, Select } from '../components/common/FormField'
import styles from './Screen.module.css'
import dayjs from 'dayjs'

function loadFeedTypes() {
  try {
    const stored = localStorage.getItem('feedTypes')
    if (stored) return JSON.parse(stored)
  } catch {}
  return []
}

function saveFeedTypes(types) {
  localStorage.setItem('feedTypes', JSON.stringify(types))
}

const EMPTY_FEED = {
  date: dayjs().format('YYYY-MM-DD'),
  flock_id: '',
  feed_type: '',
  quantity_kg: '',
  notes: '',
}

const EMPTY_WATER = {
  date: dayjs().format('YYYY-MM-DD'),
  flock_id: '',
  litres: '',
  notes: '',
}

// ─── Feed stock breakdown panel ───────────────────────────────────────────────
function StockByTypePanel({ byType }) {
  const [open, setOpen] = useState(true)
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: '#f8fafc', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', borderBottom: open ? '1px solid #e2e8f0' : 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🌾</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Stock by Feed Type</span>
          <span style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>{byType.length} type{byType.length !== 1 ? 's' : ''}</span>
        </div>
        <span style={{ fontSize: 13, color: '#64748b' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, padding: 16 }}>
          {byType.map(t => {
            const pct = t.purchased_kg > 0 ? (t.stock_kg / t.purchased_kg) * 100 : 0
            const color = t.stock_kg <= 0 ? '#dc2626' : t.stock_kg < 50 ? '#d97706' : '#16a34a'
            return (
              <div key={t.feed_type} style={{ background: '#f9fafb', borderRadius: 10, padding: '14px 16px', border: `1.5px solid ${color}33`, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.feed_type}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1.1 }}>{t.stock_kg.toFixed(1)} <span style={{ fontSize: 16, fontWeight: 600 }}>kg</span></div>
                <div style={{ height: 5, background: '#e2e8f0', borderRadius: 100, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 100 }} />
                </div>
                <div style={{ fontSize: 13, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                  <span>📥 {t.purchased_kg.toFixed(1)} kg in</span>
                  <span>📤 {t.consumed_kg.toFixed(1)} kg used</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Feed tab ─────────────────────────────────────────────────────────────────
function FeedTab({ monthYear }) {
  const [records, setRecords] = useState([])
  const [summary, setSummary] = useState(null)
  const [stock, setStock] = useState(null)
  const [flocks, setFlocks] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editRecord, setEditRecord] = useState(null)
  const [form, setForm] = useState(EMPTY_FEED)
  const [feedTypes, setFeedTypes] = useState(loadFeedTypes)
  const [newFeedType, setNewFeedType] = useState('')
  const [addingFeedType, setAddingFeedType] = useState(false)
  const [usageUnit, setUsageUnit] = useState('kg')
  const [bagKg, setBagKg] = useState(25)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [r, s, f, st, cfg] = await Promise.all([
      window.api.feed.getAll(monthYear),
      window.api.feed.getSummary(monthYear),
      window.api.flocks.getAll(),
      window.api.feed.getStock(),
      window.api.settings.get(),
    ])
    setRecords(r)
    setSummary(s)
    setFlocks(f)
    setStock(st)
    if (cfg.feed_bag_kg) setBagKg(Number(cfg.feed_bag_kg))
    setLoading(false)
  }, [monthYear])

  useEffect(() => { load() }, [load])

  function openAdd() {
    setEditRecord(null)
    setForm({ ...EMPTY_FEED, flock_id: flocks[0]?.id || '', date: dayjs().format('YYYY-MM-DD') })
    setShowModal(true)
  }

  function openEdit(row) {
    setEditRecord(row)
    setForm({ date: row.date, flock_id: row.flock_id || '', feed_type: row.feed_type, quantity_kg: row.quantity_kg, notes: row.notes || '' })
    setShowModal(true)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this feed record?')) return
    await window.api.feed.delete(id)
    load()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const data = { ...form, month_year: toMonthYear(form.date), flock_id: form.flock_id ? Number(form.flock_id) : null, quantity_kg: Number(form.quantity_kg) }
    if (editRecord) await window.api.feed.update(editRecord.id, data)
    else await window.api.feed.add(data)
    setShowModal(false)
    load()
  }

  const totalKgUsed = summary?.totals?.total_kg || 0
  const stockOnHand = stock?.stockOnHandKg || 0
  const totalPurchased = stock?.totalPurchasedKg || 0

  const columns = [
    { key: 'date', label: 'Date', render: v => formatDate(v) },
    { key: 'flock_name', label: 'Flock', render: (v, row) => v
      ? <span className={styles.flockBadge} style={{ background: (row.flock_color || '#2563eb') + '22', color: row.flock_color || '#2563eb', borderColor: (row.flock_color || '#2563eb') + '55' }}>{v}</span>
      : <span style={{ color: 'var(--color-text-muted)' }}>All Flocks</span>
    },
    { key: 'feed_type', label: 'Feed Type', render: v => <span className={styles.badge}>{v}</span> },
    { key: 'quantity_kg', label: 'Consumed (kg)', align: 'right', render: v => `${v} kg` },
    { key: 'notes', label: 'Notes', render: v => v || '—' },
    { key: 'actions', label: '', align: 'right', width: 110, render: (_, row) => (
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>Edit</Button>
        <Button size="sm" variant="danger" onClick={() => handleDelete(row.id)}>Del</Button>
      </div>
    )},
  ]

  if (loading) return <PageLoader />

  return (
    <div className={styles.page}>
      <div className={styles.statsRow}>
        <StatCard label="Stock on Hand" value={`${stockOnHand.toFixed(1)} kg`} icon="🌾" accent="primary" sub={`${totalPurchased.toFixed(1)} kg purchased all-time`} />
        <StatCard label="Used This Month" value={`${totalKgUsed.toFixed(1)} kg`} icon="📉" accent="danger" />
        {(summary?.byType || []).map(t => (
          <StatCard key={t.feed_type} label={t.feed_type} value={`${(t.total_kg || 0).toFixed(1)} kg`} />
        ))}
      </div>

      {(stock?.byType || []).length > 0 && <StockByTypePanel byType={stock.byType} />}

      <div className={styles.toolbar}>
        <Button onClick={openAdd}>+ Log Feed Usage</Button>
        <span className={styles.recordCount}>{records.length} record{records.length !== 1 ? 's' : ''} this month</span>
      </div>

      <Table columns={columns} data={records} emptyMessage="No feed usage recorded this month." />

      {showModal && (
        <Modal
          title={editRecord ? 'Edit Feed Usage' : 'Log Feed Usage'}
          onClose={() => setShowModal(false)}
          footer={<><Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button><Button onClick={handleSubmit}>Save</Button></>}
        >
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.formGrid}>
              <FormField label="Date">
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
              </FormField>
              <FormField label="Flock (leave blank for all)">
                <Select value={form.flock_id} onChange={e => setForm(f => ({ ...f, flock_id: e.target.value }))}>
                  <option value="">All Flocks</option>
                  {flocks.map(fk => <option key={fk.id} value={fk.id}>{fk.name}</option>)}
                </Select>
              </FormField>
              <FormField label="Feed Type">
                <div style={{ display: 'flex', gap: 8 }}>
                  <Select value={form.feed_type} style={{ flex: 1 }} required onChange={e => setForm(f => ({ ...f, feed_type: e.target.value }))}>
                    <option value="">— Select type —</option>
                    {feedTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </Select>
                  <button type="button" title="Add new feed type" onClick={() => { setAddingFeedType(true); setNewFeedType('') }}
                    style={{ flexShrink: 0, height: 48, width: 48, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                </div>
                {form.feed_type && (() => {
                  const typeStock = stock?.byType?.find(t => t.feed_type === form.feed_type)
                  if (!typeStock) return <div style={{ marginTop: 6, fontSize: 13, color: '#94a3b8' }}>No stock data for this type yet</div>
                  const kg = typeStock.stock_kg
                  const color = kg <= 0 ? '#dc2626' : kg < 50 ? '#d97706' : '#16a34a'
                  return <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color, display: 'flex', alignItems: 'center', gap: 5 }}>{kg <= 0 ? '⚠️' : kg < 50 ? '⚡' : '✅'} Stock on hand: {kg.toFixed(1)} kg</div>
                })()}
                {addingFeedType && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input autoFocus type="text" placeholder="New feed type name" value={newFeedType}
                      onChange={e => setNewFeedType(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          const trimmed = newFeedType.trim()
                          if (trimmed && !feedTypes.includes(trimmed)) { const u = [...feedTypes, trimmed]; setFeedTypes(u); saveFeedTypes(u); setForm(f => ({ ...f, feed_type: trimmed })) }
                          setAddingFeedType(false); setNewFeedType('')
                        }
                        if (e.key === 'Escape') { setAddingFeedType(false); setNewFeedType('') }
                      }}
                      style={{ flex: 1, border: '1.5px solid var(--color-primary)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 15, outline: 'none', fontFamily: 'var(--font)' }}
                    />
                    <button type="button" onClick={() => {
                      const trimmed = newFeedType.trim()
                      if (trimmed && !feedTypes.includes(trimmed)) { const u = [...feedTypes, trimmed]; setFeedTypes(u); saveFeedTypes(u); setForm(f => ({ ...f, feed_type: trimmed })) }
                      setAddingFeedType(false); setNewFeedType('')
                    }} style={{ height: 48, padding: '0 16px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>Add</button>
                    <button type="button" onClick={() => { setAddingFeedType(false); setNewFeedType('') }}
                      style={{ height: 48, padding: '0 14px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 'var(--radius-sm)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>✕</button>
                  </div>
                )}
              </FormField>
              <FormField label="Quantity Used">
                <div style={{ display: 'flex', gap: 8 }}>
                  <Input type="number" min="0" step={usageUnit === 'bags' ? '1' : '0.1'}
                    placeholder={usageUnit === 'bags' ? 'e.g. 2' : 'e.g. 50'}
                    value={usageUnit === 'bags' ? (form.quantity_kg ? String(Math.round((Number(form.quantity_kg) / bagKg) * 10) / 10) : '') : form.quantity_kg}
                    onChange={e => { const val = e.target.value; setForm(f => ({ ...f, quantity_kg: usageUnit === 'bags' ? String(Math.round(Number(val) * bagKg * 10) / 10) : val })) }}
                    required
                  />
                  <Select value={usageUnit} style={{ width: 100, flexShrink: 0 }} onChange={e => setUsageUnit(e.target.value)}>
                    <option value="kg">kg</option>
                    <option value="bags">bags</option>
                  </Select>
                </div>
                {usageUnit === 'bags' && form.quantity_kg && (
                  <div style={{ marginTop: 6, fontSize: 13, color: '#16a34a', fontWeight: 600 }}>= {form.quantity_kg} kg</div>
                )}
              </FormField>
            </div>
            <FormField label="Notes">
              <Input type="text" placeholder="Optional notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </FormField>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ─── Water tab ────────────────────────────────────────────────────────────────
function WaterTab({ monthYear }) {
  const [records, setRecords] = useState([])
  const [summary, setSummary] = useState(null)
  const [flocks, setFlocks] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editRecord, setEditRecord] = useState(null)
  const [form, setForm] = useState(EMPTY_WATER)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [r, s, f] = await Promise.all([
      window.api.water.getAll(monthYear),
      window.api.water.getSummary(monthYear),
      window.api.flocks.getAll(),
    ])
    setRecords(r)
    setSummary(s)
    setFlocks(f)
    setLoading(false)
  }, [monthYear])

  useEffect(() => { load() }, [load])

  function openAdd() {
    setEditRecord(null)
    setForm({ ...EMPTY_WATER, flock_id: flocks[0]?.id || '', date: dayjs().format('YYYY-MM-DD') })
    setShowModal(true)
  }

  function openEdit(row) {
    setEditRecord(row)
    setForm({ date: row.date, flock_id: row.flock_id || '', litres: row.litres, notes: row.notes || '' })
    setShowModal(true)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this water record?')) return
    await window.api.water.delete(id)
    load()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const data = { ...form, month_year: toMonthYear(form.date), flock_id: form.flock_id ? Number(form.flock_id) : null, litres: Number(form.litres) }
    if (editRecord) await window.api.water.update(editRecord.id, data)
    else await window.api.water.add(data)
    setShowModal(false)
    load()
  }

  const totalLitres = summary?.total || 0

  const columns = [
    { key: 'date', label: 'Date', render: v => formatDate(v) },
    { key: 'flock_name', label: 'Flock', render: (v, row) => v
      ? <span className={styles.flockBadge} style={{ background: (row.flock_color || '#2563eb') + '22', color: row.flock_color || '#2563eb', borderColor: (row.flock_color || '#2563eb') + '55' }}>{v}</span>
      : <span style={{ color: 'var(--color-text-muted)' }}>All Flocks</span>
    },
    { key: 'litres', label: 'Water (L)', align: 'right', render: v => `${v} L` },
    { key: 'notes', label: 'Notes', render: v => v || '—' },
    { key: 'actions', label: '', align: 'right', width: 110, render: (_, row) => (
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>Edit</Button>
        <Button size="sm" variant="danger" onClick={() => handleDelete(row.id)}>Del</Button>
      </div>
    )},
  ]

  if (loading) return <PageLoader />

  return (
    <div className={styles.page}>
      <div className={styles.statsRow}>
        <StatCard label="Total This Month" value={`${totalLitres.toFixed(0)} L`} icon="💧" accent="primary" />
        {(summary?.byFlock || []).map(f => (
          <StatCard key={f.flock_id ?? 'all'} label={f.flock_name || 'All Flocks'} value={`${(f.total_litres || 0).toFixed(0)} L`} />
        ))}
      </div>

      <div className={styles.toolbar}>
        <Button onClick={openAdd}>+ Log Water Intake</Button>
        <span className={styles.recordCount}>{records.length} record{records.length !== 1 ? 's' : ''} this month</span>
      </div>

      <Table columns={columns} data={records} emptyMessage="No water intake recorded this month." />

      {showModal && (
        <Modal
          title={editRecord ? 'Edit Water Intake' : 'Log Water Intake'}
          onClose={() => setShowModal(false)}
          footer={<><Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button><Button onClick={handleSubmit}>Save</Button></>}
        >
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.formGrid}>
              <FormField label="Date">
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
              </FormField>
              <FormField label="Flock (leave blank for all)">
                <Select value={form.flock_id} onChange={e => setForm(f => ({ ...f, flock_id: e.target.value }))}>
                  <option value="">All Flocks</option>
                  {flocks.map(fk => <option key={fk.id} value={fk.id}>{fk.name}</option>)}
                </Select>
              </FormField>
              <FormField label="Water Consumed (litres)">
                <Input type="number" min="0" step="0.5" placeholder="e.g. 120" value={form.litres}
                  onChange={e => setForm(f => ({ ...f, litres: e.target.value }))} required />
              </FormField>
              <FormField label="Notes">
                <Input type="text" placeholder="Optional notes" value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </FormField>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ─── Root export ──────────────────────────────────────────────────────────────
export default function FeedLog() {
  const { monthYear } = useMonth()
  const [activeTab, setActiveTab] = useState('feed')

  return (
    <div className={styles.page}>
      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '2px solid #e2e8f0', marginBottom: 20 }}>
        {[{ id: 'feed', label: '🌾 Feed' }, { id: 'water', label: '💧 Water' }].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 22px', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)',
              fontSize: 14.5, fontWeight: 600, background: 'none',
              color: activeTab === tab.id ? 'var(--color-primary)' : '#64748b',
              borderBottom: activeTab === tab.id ? '2px solid var(--color-primary)' : '2px solid transparent',
              marginBottom: -2, transition: 'all 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'feed' && <FeedTab monthYear={monthYear} />}
      {activeTab === 'water' && <WaterTab monthYear={monthYear} />}
    </div>
  )
}
