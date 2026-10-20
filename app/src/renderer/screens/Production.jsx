import React, { useEffect, useState, useCallback } from 'react'
import { useMonth } from '../utils/MonthContext'
import { formatDate, formatEggs, toMonthYear } from '../utils/format'
import Table from '../components/common/Table'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import StatCard from '../components/common/StatCard'
import FormField, { Input, Select } from '../components/common/FormField'
import styles from './Screen.module.css'
import dayjs from 'dayjs'

const EMPTY_FORM = {
  date: dayjs().format('YYYY-MM-DD'),
  flock_id: '',
  no_of_birds: '',
  crates: '',
  pieces: '',
}

export default function Production() {
  const { monthYear } = useMonth()
  const [records, setRecords] = useState([])
  const [summary, setSummary] = useState(null)
  const [flocks, setFlocks] = useState([])
  const [liveBirdCounts, setLiveBirdCounts] = useState({}) // flock_id -> live count
  const [showModal, setShowModal] = useState(false)
  const [editRecord, setEditRecord] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [showOpeningModal, setShowOpeningModal] = useState(false)
  const [openingForms, setOpeningForms] = useState({})

  const load = useCallback(async () => {
    const [r, s, f, movSummary] = await Promise.all([
      window.api.production.getAll(monthYear),
      window.api.production.getSummary(monthYear),
      window.api.flocks.getAll(),
      window.api.mortality.getSummary(monthYear),
    ])
    setRecords(r)
    setSummary(s)
    setFlocks(f)

    // Build live bird count map: flock_id -> live birds
    const counts = {}
    ;(movSummary?.flockBirdCounts || []).forEach(fc => {
      counts[fc.id] = Math.max(fc.initial_bird_count - fc.total_removed, 0)
    })
    setLiveBirdCounts(counts)

    // Build opening form state per flock
    const existing = {}
    s.opening.forEach(o => { existing[o.flock_id] = { crates: o.crates, pieces: o.pieces } })
    const openingInit = {}
    f.forEach(flock => {
      openingInit[flock.id] = existing[flock.id] || { crates: 0, pieces: 0 }
    })
    setOpeningForms(openingInit)
  }, [monthYear])

  useEffect(() => { load() }, [load])

  function openAdd() {
    setEditRecord(null)
    const firstFlock = flocks[0]
    setForm({
      ...EMPTY_FORM,
      date: dayjs().format('YYYY-MM-DD'),
      flock_id: firstFlock?.id || '',
      no_of_birds: firstFlock ? (liveBirdCounts[firstFlock.id] ?? '') : '',
    })
    setShowModal(true)
  }

  function openEdit(row) {
    setEditRecord(row)
    setForm({
      date: row.date, flock_id: row.flock_id,
      no_of_birds: row.no_of_birds, crates: row.crates, pieces: row.pieces,
    })
    setShowModal(true)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this record?')) return
    await window.api.production.delete(id)
    load()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const data = {
      date: form.date,
      month_year: toMonthYear(form.date),
      flock_id: Number(form.flock_id),
      no_of_birds: Number(form.no_of_birds),
      crates: Number(form.crates),
      pieces: Number(form.pieces),
    }
    if (editRecord) {
      await window.api.production.update(editRecord.id, data)
    } else {
      await window.api.production.add(data)
    }
    setShowModal(false)
    load()
  }

  async function handleOpeningSubmit(e) {
    e.preventDefault()
    for (const [flock_id, vals] of Object.entries(openingForms)) {
      await window.api.production.add({
        date: monthYear + '-01',
        month_year: monthYear,
        flock_id: Number(flock_id),
        no_of_birds: 0,
        crates: 0,
        pieces: 0,
        _opening_stock: { flock_id: Number(flock_id), crates: Number(vals.crates), pieces: Number(vals.pieces) }
      })
    }
    setShowOpeningModal(false)
    load()
  }

  const totalProduced = summary?.byFlock?.reduce((s, f) => s + (f.total_eggs || 0), 0) || 0
  const totalOpeningEggs = summary?.opening?.reduce((s, o) => s + (o.crates * 30 + o.pieces), 0) || 0

  const [dismissedAlerts, setDismissedAlerts] = useState([])
  const today = new Date()
  const soon = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
  const lifecycleAlerts = flocks
    .filter(f => f.is_active && f.expected_lay_end && !dismissedAlerts.includes(f.id))
    .map(f => {
      const end = new Date(f.expected_lay_end)
      const daysLeft = Math.ceil((end - today) / (1000 * 60 * 60 * 24))
      if (end > soon) return null
      return { flock: f, daysLeft }
    })
    .filter(Boolean)

  const columns = [
    { key: 'date', label: 'Date', render: v => formatDate(v) },
    { key: 'flock_name', label: 'Flock', render: (v, row) => (
      <span className={styles.flockBadge} style={{ background: row.flock_color + '22', color: row.flock_color, borderColor: row.flock_color + '55' }}>
        {v || '—'}
      </span>
    )},
    { key: 'no_of_birds', label: 'Birds', align: 'right' },
    { key: 'crates', label: 'Crates', align: 'right' },
    { key: 'pieces', label: 'Pieces', align: 'right' },
    { key: 'total_eggs', label: 'Total Eggs', align: 'right' },
    { key: 'daily_yield_pct', label: '% Production', align: 'right',
      render: v => <span className={styles.badge}>{v}%</span> },
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
        <StatCard label="Opening Stock" value={formatEggs(totalOpeningEggs)} icon="📦" />
        {(summary?.byFlock || []).map(f => (
          <StatCard
            key={f.flock_id}
            label={f.flock_name || 'Unknown Flock'}
            value={formatEggs(f.total_eggs || 0)}
            icon="🐓"
            accent="primary"
          />
        ))}
        <StatCard label="Total Produced" value={formatEggs(totalProduced)} icon="🥚" />
      </div>

      {lifecycleAlerts.length > 0 && (
        <div className={styles.alertStack}>
          {lifecycleAlerts.map(({ flock, daysLeft }) => (
            <div
              key={flock.id}
              className={styles.lifecycleAlert}
              style={{ borderLeftColor: daysLeft <= 0 ? '#dc2626' : '#d97706' }}
            >
              <span className={styles.alertIcon}>{daysLeft <= 0 ? '🔴' : '⚠️'}</span>
              <div className={styles.alertBody}>
                <span className={styles.alertTitle} style={{ color: daysLeft <= 0 ? '#dc2626' : '#d97706' }}>
                  {daysLeft <= 0
                    ? `${flock.name} is past its retirement date`
                    : `${flock.name} retires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}
                </span>
                <span className={styles.alertText}>
                  {daysLeft <= 0
                    ? 'This flock has passed its expected laying period. Consider culling or replacing them to maintain farm productivity.'
                    : `Expected lay end: ${flock.expected_lay_end}. Plan for a replacement flock and notify buyers of any upcoming supply changes.`}
                </span>
              </div>
              <button
                className={styles.alertDismiss}
                onClick={() => setDismissedAlerts(d => [...d, flock.id])}
                title="Dismiss"
              >✕</button>
            </div>
          ))}
        </div>
      )}

      <div className={styles.toolbar}>
        <Button onClick={openAdd}>+ Add Record</Button>
        <Button variant="secondary" onClick={() => setShowOpeningModal(true)}>Set Opening Stock</Button>
      </div>

      <Table columns={columns} data={records} emptyMessage="No production records for this month." />

      {showModal && (
        <Modal
          title={editRecord ? 'Edit Production Record' : 'Add Production Record'}
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
                  onChange={e => {
                    const id = Number(e.target.value)
                    setForm(f => ({
                      ...f,
                      flock_id: id,
                      no_of_birds: liveBirdCounts[id] ?? f.no_of_birds,
                    }))
                  }}>
                  {flocks.map(fk => (
                    <option key={fk.id} value={fk.id}>{fk.name}</option>
                  ))}
                </Select>
              </FormField>
              <FormField
                label="No. of Birds"
                hint={form.flock_id && liveBirdCounts[form.flock_id] !== undefined
                  ? `Auto-filled: ${liveBirdCounts[form.flock_id]} live birds in this flock`
                  : 'Set initial bird count in Flock Movement to auto-fill'}
              >
                <Input type="number" min="0" value={form.no_of_birds}
                  onChange={e => setForm(f => ({ ...f, no_of_birds: e.target.value }))} required />
              </FormField>
              <FormField label="Crates">
                <Input type="number" min="0" value={form.crates}
                  onChange={e => setForm(f => ({ ...f, crates: e.target.value }))} required />
              </FormField>
              <FormField label="Pieces (loose, 0–29)">
                <Input type="number" min="0" max="29" value={form.pieces}
                  onChange={e => setForm(f => ({ ...f, pieces: e.target.value }))} required />
              </FormField>
            </div>
            {form.crates !== '' && form.pieces !== '' && (
              <div className={styles.preview}>
                Total: {Number(form.crates) * 30 + Number(form.pieces)} eggs
                {form.no_of_birds > 0 && ` · % Production: ${Math.round(((Number(form.crates) * 30 + Number(form.pieces)) / Number(form.no_of_birds)) * 100)}%`}
              </div>
            )}
          </form>
        </Modal>
      )}

      {showOpeningModal && (
        <Modal
          title="Set Opening Stock"
          onClose={() => setShowOpeningModal(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowOpeningModal(false)}>Cancel</Button>
              <Button onClick={handleOpeningSubmit}>Save</Button>
            </>
          }
        >
          <form onSubmit={handleOpeningSubmit} className={styles.form}>
            <p className={styles.hint}>Egg stock carried forward into {monthYear}, per flock.</p>
            {flocks.map(flock => (
              <div key={flock.id}>
                <div className={styles.domSectionTitle} style={{ color: flock.color }}>{flock.name}</div>
                <div className={styles.formGrid2col} style={{ marginTop: 8 }}>
                  <FormField label="Crates">
                    <Input type="number" min="0"
                      value={openingForms[flock.id]?.crates ?? 0}
                      onChange={e => setOpeningForms(prev => ({
                        ...prev, [flock.id]: { ...prev[flock.id], crates: e.target.value }
                      }))} />
                  </FormField>
                  <FormField label="Pieces">
                    <Input type="number" min="0" max="29"
                      value={openingForms[flock.id]?.pieces ?? 0}
                      onChange={e => setOpeningForms(prev => ({
                        ...prev, [flock.id]: { ...prev[flock.id], pieces: e.target.value }
                      }))} />
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
