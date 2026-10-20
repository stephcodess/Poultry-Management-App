import React, { useEffect, useState, useCallback } from 'react'
import { useMonth } from '../utils/MonthContext'
import { formatDate, toMonthYear } from '../utils/format'
import Table from '../components/common/Table'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import StatCard from '../components/common/StatCard'
import FormField, { Input, Select } from '../components/common/FormField'
import styles from './Screen.module.css'
import mStyles from './Mortality.module.css'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import dayjs from 'dayjs'

const REASONS = [
  'Death — Disease',
  'Death — Injury',
  'Death — Heat Stress',
  'Death — Unknown',
  'Sold (Live Bird)',
  'Domestic Use',
  'Given Out / Gift',
  'Culled (Unproductive)',
  'Transferred to Another Flock',
  'Other',
]

const REASON_COLORS = {
  'Death — Disease': '#dc2626',
  'Death — Injury': '#ef4444',
  'Death — Heat Stress': '#f97316',
  'Death — Unknown': '#6b7280',
  'Sold (Live Bird)': '#16a34a',
  'Domestic Use': '#2563eb',
  'Given Out / Gift': '#7c3aed',
  'Culled (Unproductive)': '#d97706',
  'Transferred to Another Flock': '#0891b2',
  'Other': '#9ca3af',
}

const REASON_ICONS = {
  'Death — Disease': '🦠',
  'Death — Injury': '🩹',
  'Death — Heat Stress': '🌡',
  'Death — Unknown': '❓',
  'Sold (Live Bird)': '💰',
  'Domestic Use': '🍗',
  'Given Out / Gift': '🎁',
  'Culled (Unproductive)': '✂',
  'Transferred to Another Flock': '🔄',
  'Other': '📝',
}

const EMPTY_FORM = {
  date: dayjs().format('YYYY-MM-DD'),
  flock_id: '',
  count: '',
  reason: 'Death — Disease',
  notes: '',
}

const PIE_COLORS = Object.values(REASON_COLORS)

export default function FlockMovements() {
  const { monthYear } = useMonth()
  const [records, setRecords] = useState([])
  const [summary, setSummary] = useState(null)
  const [flocks, setFlocks] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editRecord, setEditRecord] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const load = useCallback(async () => {
    const [r, s, f] = await Promise.all([
      window.api.mortality.getAll(monthYear),
      window.api.mortality.getSummary(monthYear),
      window.api.flocks.getAll(),
    ])
    setRecords(r)
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
    setForm({ date: row.date, flock_id: row.flock_id, count: row.count, reason: row.reason, notes: row.notes || '' })
    setShowModal(true)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this movement record?')) return
    await window.api.mortality.delete(id)
    load()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const data = {
      date: form.date,
      month_year: toMonthYear(form.date),
      flock_id: Number(form.flock_id),
      count: Number(form.count),
      reason: form.reason,
      notes: form.notes,
    }
    if (editRecord) {
      await window.api.mortality.update(editRecord.id, data)
    } else {
      await window.api.mortality.add(data)
    }
    setShowModal(false)
    load()
  }

  const isDeath = (reason) => reason?.startsWith('Death')

  const pieData = (summary?.byReason || []).map(r => ({
    name: r.reason,
    value: r.total,
  }))

  const columns = [
    { key: 'date', label: 'Date', render: v => formatDate(v) },
    { key: 'flock_name', label: 'Flock', render: (v, row) => (
      <span className={styles.flockBadge} style={{ background: (row.flock_color || '#6b7280') + '22', color: row.flock_color || '#6b7280', borderColor: (row.flock_color || '#6b7280') + '55' }}>
        {v || '—'}
      </span>
    )},
    { key: 'count', label: 'Birds', align: 'right', render: (v, row) => (
      <span style={{ fontWeight: 600, color: isDeath(row.reason) ? '#dc2626' : '#16a34a' }}>
        {isDeath(row.reason) ? '−' : '↗'}{v}
      </span>
    )},
    { key: 'reason', label: 'Reason', render: v => (
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{REASON_ICONS[v] || '📝'}</span>
        <span style={{ fontSize: 12, color: REASON_COLORS[v] || 'var(--color-text)', fontWeight: 500 }}>{v}</span>
      </span>
    )},
    { key: 'notes', label: 'Notes', render: v => v || <span style={{ color: 'var(--color-text-muted)' }}>—</span> },
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
      {/* Live bird count cards per flock */}
      <div className={mStyles.birdGrid}>
        {(summary?.flockBirdCounts || []).map(f => {
          const liveBirds = Math.max(f.initial_bird_count - f.total_removed, 0)
          const removalPct = f.initial_bird_count > 0
            ? ((f.total_removed / f.initial_bird_count) * 100).toFixed(1)
            : 0
          return (
            <div key={f.id} className={mStyles.birdCard} style={{ borderTopColor: f.color }}>
              <div className={mStyles.birdCardHeader}>
                <span className={mStyles.flockDot} style={{ background: f.color }} />
                <span className={mStyles.flockName}>{f.name}</span>
              </div>
              <div className={mStyles.birdStat}>
                <div>
                  <div className={mStyles.birdCount}>{liveBirds.toLocaleString()}</div>
                  <div className={mStyles.birdLabel}>Live Birds</div>
                </div>
                <div className={mStyles.birdDivider} />
                <div>
                  <div className={mStyles.birdDead}>{f.total_removed}</div>
                  <div className={mStyles.birdLabel}>Total Removed</div>
                </div>
                <div className={mStyles.birdDivider} />
                <div>
                  <div className={mStyles.birdPct} style={{ color: removalPct > 10 ? '#dc2626' : '#16a34a' }}>
                    {removalPct}%
                  </div>
                  <div className={mStyles.birdLabel}>Reduction</div>
                </div>
              </div>
              <div className={mStyles.progressTrack}>
                <div className={mStyles.progressFill} style={{
                  width: `${Math.min((liveBirds / Math.max(f.initial_bird_count, 1)) * 100, 100)}%`,
                  background: f.color,
                }} />
              </div>
              <div className={mStyles.progressLabels}>
                <span>0</span>
                <span>{f.initial_bird_count} initial</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary + Pie chart row */}
      <div className={mStyles.summaryRow}>
        <div className={styles.statsRow} style={{ flex: 1 }}>
          <StatCard label="Removed This Month" value={summary?.totalThisMonth || 0} icon="📋" />
          {(summary?.byReason || []).slice(0, 4).map(r => (
            <StatCard
              key={r.reason}
              label={r.reason}
              value={`${r.total} birds`}
              icon={REASON_ICONS[r.reason] || '📝'}
            />
          ))}
        </div>

        {pieData.length > 0 && (
          <div className={mStyles.pieCard}>
            <div className={mStyles.pieTitle}>By Reason</div>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                  paddingAngle={3}>
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={REASON_COLORS[entry.name] || PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />
                  ))}
                </Pie>
                <Tooltip formatter={v => [`${v} birds`, '']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className={styles.toolbar}>
        <Button onClick={openAdd}>+ Record Movement</Button>
      </div>

      <Table columns={columns} data={records} emptyMessage="No flock movements recorded this month." />

      {showModal && (
        <Modal
          title={editRecord ? 'Edit Movement Record' : 'Record Flock Movement'}
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
                  {flocks.map(fk => <option key={fk.id} value={fk.id}>{fk.name}</option>)}
                </Select>
              </FormField>
              <FormField label="Number of Birds">
                <Input type="number" min="1" value={form.count}
                  onChange={e => setForm(f => ({ ...f, count: e.target.value }))} required />
              </FormField>
              <FormField label="Reason">
                <Select value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}>
                  {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </Select>
              </FormField>
            </div>
            <FormField label="Notes (optional)">
              <Input type="text" placeholder="Any additional details…"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </FormField>
          </form>
        </Modal>
      )}
    </div>
  )
}
