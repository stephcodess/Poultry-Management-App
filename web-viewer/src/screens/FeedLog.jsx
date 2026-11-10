import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useMonth } from '../utils/MonthContext'
import { useAuth } from '../utils/AuthContext'
import { formatDate, toMonthYear } from '../utils/format'
import Modal from '../components/common/Modal'
import Button from '../components/common/Button'
import FormField from '../components/common/FormField'
import styles from './FeedLog.module.css'
import dayjs from 'dayjs'

function loadFeedTypes() {
  try { const s = localStorage.getItem('feedTypes'); if (s) return JSON.parse(s) } catch {}
  return ['Layers Mash', 'Layers Pellets', 'Broiler Starter', 'Broiler Finisher']
}
function saveFeedTypes(types) { localStorage.setItem('feedTypes', JSON.stringify(types)) }

const EMPTY_FEED = { date: dayjs().format('YYYY-MM-DD'), flock_id: '', feed_type: '', quantity_kg: '', notes: '' }
const EMPTY_WATER = { date: dayjs().format('YYYY-MM-DD'), flock_id: '', litres: '', notes: '' }

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

function StockPanel({ byType }) {
  const [open, setOpen] = useState(true)
  if (!byType || byType.length === 0) return null
  return (
    <div className={styles.stockPanel}>
      <button type="button" className={styles.stockPanelHeader} onClick={() => setOpen(o => !o)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🌾</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>Stock by Feed Type</span>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{byType.length} type{byType.length !== 1 ? 's' : ''}</span>
        </div>
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className={styles.stockGrid}>
          {byType.map(t => {
            const pct = t.purchased_kg > 0 ? (t.stock_kg / t.purchased_kg) * 100 : 0
            const color = t.stock_kg <= 0 ? '#dc2626' : t.stock_kg < 50 ? '#d97706' : '#16a34a'
            return (
              <div key={t.feed_type} className={styles.stockCard}>
                <div className={styles.stockName}>{t.feed_type}</div>
                <div className={styles.stockKg} style={{ color }}>{t.stock_kg.toFixed(1)} kg</div>
                <div style={{ height: 5, background: '#f1f5f9', borderRadius: 5, overflow: 'hidden', margin: '6px 0' }}>
                  <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, background: color, borderRadius: 5 }} />
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  {t.purchased_kg.toFixed(1)} kg purchased · {t.consumed_kg.toFixed(1)} kg fed
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FeedTab({ monthYear }) {
  const { can } = useAuth()
  const [records, setRecords] = useState([])
  const [stockByType, setStockByType] = useState([])
  const [flocks, setFlocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editRecord, setEditRecord] = useState(null)
  const [form, setForm] = useState(EMPTY_FEED)
  const [feedTypes, setFeedTypes] = useState(loadFeedTypes)
  const [newFeedType, setNewFeedType] = useState('')
  const [addingFeedType, setAddingFeedType] = useState(false)
  const [bagKg, setBagKg] = useState(25)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [recRes, fkRes, cfgRes, allFeedRes, allExpRes] = await Promise.all([
        supabase.from('feed_log').select('*, flocks(name, color)').eq('month_year', monthYear).order('date', { ascending: false }),
        supabase.from('flocks').select('*').neq('is_active', 0).order('name'),
        supabase.from('settings').select('value').eq('key', 'feed_bag_kg').maybeSingle(),
        supabase.from('feed_log').select('feed_type, quantity_kg'),
        supabase.from('expenses').select('feed_type, quantity_kg').eq('category', 'Feed').not('feed_type', 'is', null),
      ])
      setRecords(recRes.data || [])
      setFlocks(fkRes.data || [])
      if (cfgRes.data?.value) setBagKg(Number(cfgRes.data.value) || 25)

      // Build stock by type
      const purchased = {}
      ;(allExpRes.data || []).forEach(r => {
        if (r.feed_type) purchased[r.feed_type] = (purchased[r.feed_type] || 0) + (r.quantity_kg || 0)
      })
      const consumed = {}
      ;(allFeedRes.data || []).forEach(r => {
        if (r.feed_type) consumed[r.feed_type] = (consumed[r.feed_type] || 0) + (r.quantity_kg || 0)
      })
      const types = [...new Set([...Object.keys(purchased), ...Object.keys(consumed)])]
      const stock = types.map(t => ({
        feed_type: t,
        purchased_kg: purchased[t] || 0,
        consumed_kg: consumed[t] || 0,
        stock_kg: (purchased[t] || 0) - (consumed[t] || 0),
      }))
      setStockByType(stock)
    } finally { setLoading(false) }
  }, [monthYear])

  useEffect(() => { load() }, [load])

  const totalKg = records.reduce((s, r) => s + (r.quantity_kg || 0), 0)

  function openAdd() {
    setEditRecord(null)
    setForm({ ...EMPTY_FEED, date: dayjs().format('YYYY-MM-DD'), flock_id: flocks[0]?.id || '', feed_type: feedTypes[0] || '' })
    setShowModal(true)
  }

  function openEdit(row) {
    setEditRecord(row)
    setForm({ date: row.date, flock_id: row.flock_id || '', feed_type: row.feed_type || '', quantity_kg: String(row.quantity_kg || ''), notes: row.notes || '' })
    setShowModal(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const data = { date: form.date, month_year: toMonthYear(form.date), flock_id: form.flock_id ? Number(form.flock_id) : null, feed_type: form.feed_type, quantity_kg: Number(form.quantity_kg), notes: form.notes || null }
      if (editRecord) await supabase.from('feed_log').update(data).eq('id', editRecord.id)
      else await supabase.from('feed_log').insert(data)
      setShowModal(false)
      load()
    } finally { setSaving(false) }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this feed record?')) return
    await supabase.from('feed_log').delete().eq('id', id)
    load()
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '40px 24px', color: 'var(--color-text-secondary)', fontSize: 14 }}>
      <div style={{ width: 20, height: 20, border: '2px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    </div>
  )

  return (
    <div className={styles.tabContent}>
      {/* Stats */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total Feed Given</div>
          <div className={styles.statValue}>{totalKg.toFixed(1)} kg</div>
          <div className={styles.statSub}>{records.length} records · {(totalKg / bagKg).toFixed(1)} bags</div>
        </div>
      </div>

      <StockPanel byType={stockByType} />

      <div className={styles.toolbar}>
        {can('write') && <Button onClick={openAdd}>+ Add Feed Record</Button>}
        <span className={styles.recordCount}>{records.length} record{records.length !== 1 ? 's' : ''} this month</span>
      </div>

      <div className={styles.tableWrapper}>
        {records.length === 0
          ? <div className={styles.empty}>No feed records this month.</div>
          : records.map(row => {
            const fk = row.flocks || flocks.find(f => f.id === row.flock_id)
            return (
              <div key={row.id} className={styles.recordCard}>
                <div className={styles.recordCardTop}>
                  <div className={styles.recordCardLeft}>
                    <span className={styles.feedBadge}>{row.feed_type || '—'}</span>
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{formatDate(row.date)}</span>
                    {fk && <span style={{ display: 'inline-block', border: `1px solid ${fk.color || '#e2e8f0'}`, borderRadius: 100, padding: '3px 10px', fontSize: 12, fontWeight: 600, color: fk.color || '#475569', background: (fk.color || '#475569') + '18' }}>{fk.name}</span>}
                  </div>
                  <div className={styles.recordCardRight}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>{row.quantity_kg} kg</span>
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

      {showModal && (
        <Modal title={editRecord ? 'Edit Feed Record' : 'Add Feed Record'} onClose={() => setShowModal(false)}
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
              <FormField label="Feed Type">
                <div style={{ display: 'flex', gap: 8 }}>
                  <Sel value={form.feed_type} onChange={e => setForm(f => ({ ...f, feed_type: e.target.value }))} style={{ flex: 1 }}>
                    <option value="">— Select type —</option>
                    {feedTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </Sel>
                  <button type="button"
                    onClick={() => { setAddingFeedType(true); setNewFeedType('') }}
                    style={{ flexShrink: 0, height: 44, width: 44, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >+</button>
                </div>
                {addingFeedType && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input autoFocus type="text" placeholder="New feed type" value={newFeedType}
                      onChange={e => setNewFeedType(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); const t = newFeedType.trim(); if (t && !feedTypes.includes(t)) { const u = [...feedTypes, t]; setFeedTypes(u); saveFeedTypes(u); setForm(f => ({ ...f, feed_type: t })) } setAddingFeedType(false); setNewFeedType('') }
                        if (e.key === 'Escape') { setAddingFeedType(false); setNewFeedType('') }
                      }}
                      style={{ flex: 1, border: '1.5px solid var(--color-primary)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 15, outline: 'none', fontFamily: 'var(--font)' }}
                    />
                    <button type="button"
                      onClick={() => { const t = newFeedType.trim(); if (t && !feedTypes.includes(t)) { const u = [...feedTypes, t]; setFeedTypes(u); saveFeedTypes(u); setForm(f => ({ ...f, feed_type: t })) } setAddingFeedType(false); setNewFeedType('') }}
                      style={{ height: 44, padding: '0 14px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}
                    >Add</button>
                    <button type="button" onClick={() => { setAddingFeedType(false); setNewFeedType('') }}
                      style={{ height: 44, padding: '0 12px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 'var(--radius-sm)', fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font)' }}
                    >✕</button>
                  </div>
                )}
              </FormField>
              <FormField label="Quantity (kg)">
                <Input type="number" min="0" step="0.1" value={form.quantity_kg} onChange={e => setForm(f => ({ ...f, quantity_kg: e.target.value }))} required />
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

function WaterTab({ monthYear }) {
  const { can } = useAuth()
  const [records, setRecords] = useState([])
  const [flocks, setFlocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editRecord, setEditRecord] = useState(null)
  const [form, setForm] = useState(EMPTY_WATER)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [recRes, fkRes] = await Promise.all([
        supabase.from('water_log').select('*, flocks(name, color)').eq('month_year', monthYear).order('date', { ascending: false }),
        supabase.from('flocks').select('*').neq('is_active', 0).order('name'),
      ])
      setRecords(recRes.data || [])
      setFlocks(fkRes.data || [])
    } finally { setLoading(false) }
  }, [monthYear])

  useEffect(() => { load() }, [load])

  const totalLitres = records.reduce((s, r) => s + (r.litres || 0), 0)

  function openAdd() { setEditRecord(null); setForm({ ...EMPTY_WATER, date: dayjs().format('YYYY-MM-DD'), flock_id: flocks[0]?.id || '' }); setShowModal(true) }
  function openEdit(row) { setEditRecord(row); setForm({ date: row.date, flock_id: row.flock_id || '', litres: String(row.litres || ''), notes: row.notes || '' }); setShowModal(true) }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const data = { date: form.date, month_year: toMonthYear(form.date), flock_id: form.flock_id ? Number(form.flock_id) : null, litres: Number(form.litres), notes: form.notes || null }
      if (editRecord) await supabase.from('water_log').update(data).eq('id', editRecord.id)
      else await supabase.from('water_log').insert(data)
      setShowModal(false)
      load()
    } finally { setSaving(false) }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this water record?')) return
    await supabase.from('water_log').delete().eq('id', id)
    load()
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '40px 24px', color: 'var(--color-text-secondary)', fontSize: 14 }}>
      <div style={{ width: 20, height: 20, border: '2px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    </div>
  )

  return (
    <div className={styles.tabContent}>
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total Water Given</div>
          <div className={styles.statValue}>{totalLitres.toLocaleString()} L</div>
          <div className={styles.statSub}>{records.length} records</div>
        </div>
      </div>

      <div className={styles.toolbar}>
        {can('write') && <Button onClick={openAdd}>+ Add Water Record</Button>}
        <span className={styles.recordCount}>{records.length} records this month</span>
      </div>

      <div className={styles.tableWrapper}>
        {records.length === 0
          ? <div className={styles.empty}>No water records this month.</div>
          : records.map(row => {
            const fk = row.flocks || flocks.find(f => f.id === row.flock_id)
            return (
              <div key={row.id} className={styles.recordCard}>
                <div className={styles.recordCardTop}>
                  <div className={styles.recordCardLeft}>
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{formatDate(row.date)}</span>
                    {fk && <span style={{ display: 'inline-block', border: `1px solid ${fk.color || '#e2e8f0'}`, borderRadius: 100, padding: '3px 10px', fontSize: 12, fontWeight: 600, color: fk.color || '#475569', background: (fk.color || '#475569') + '18' }}>{fk.name}</span>}
                  </div>
                  <div className={styles.recordCardRight}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#0891b2' }}>{row.litres} L</span>
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

      {showModal && (
        <Modal title={editRecord ? 'Edit Water Record' : 'Add Water Record'} onClose={() => setShowModal(false)}
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
              <FormField label="Litres">
                <Input type="number" min="0" step="0.1" value={form.litres} onChange={e => setForm(f => ({ ...f, litres: e.target.value }))} required />
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

export default function FeedLog() {
  const { monthYear } = useMonth()
  const [activeTab, setActiveTab] = useState('feed')

  return (
    <div className={styles.page}>
      <div className={styles.tabBar}>
        {[
          { key: 'feed', icon: '🌾', label: 'Feed Log' },
          { key: 'water', icon: '💧', label: 'Water Log' },
        ].map(t => (
          <button key={t.key}
            className={`${styles.tab} ${activeTab === t.key ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>
      {activeTab === 'feed'  && <FeedTab  monthYear={monthYear} />}
      {activeTab === 'water' && <WaterTab monthYear={monthYear} />}
    </div>
  )
}
