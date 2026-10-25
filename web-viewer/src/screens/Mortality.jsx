import React, { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { supabase } from '../supabaseClient'
import { useMonth } from '../utils/MonthContext'
import { formatDate } from '../utils/format'
import Table from '../components/common/Table'
import s from './Screen.module.css'

export default function Mortality() {
  const { monthYear } = useMonth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState([])
  const [flocks, setFlocks] = useState([])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase
        .from('flock_movements')
        .select('*, flocks(name, color)')
        .eq('month_year', monthYear)
        .order('date', { ascending: true }),
      supabase
        .from('flocks')
        .select('id, name, color, initial_bird_count, date_acquired, age_weeks_at_acquisition')
        .eq('is_active', 1),
    ]).then(([{ data: rows }, { data: fl }]) => {
      setData(rows || [])
      setFlocks(fl || [])
      setLoading(false)
    })
  }, [monthYear])

  const totalRemoved = data.reduce((sum, r) => sum + (r.count || 0), 0)
  const byReason = data.reduce((acc, r) => {
    const key = r.reason || 'Unknown'
    acc[key] = (acc[key] || 0) + (r.count || 0)
    return acc
  }, {})

  const columns = [
    { key: 'date', label: 'Date', width: 120, render: (v) => formatDate(v) },
    {
      key: 'flock_id',
      label: 'Flock',
      render: (_, row) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {row.flocks?.color && (
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: row.flocks.color, display: 'inline-block' }} />
          )}
          {row.flocks?.name || '—'}
        </span>
      ),
    },
    { key: 'reason', label: 'Reason', render: (v) => v || '—' },
    { key: 'count', label: 'Count', align: 'right', render: (v) => (v || 0).toLocaleString() },
    { key: 'notes', label: 'Notes', render: (v) => v || '—' },
  ]

  if (loading) return (
    <div className={s.loading}>
      <div className={s.spinner} />
      <span>Loading flock movements…</span>
    </div>
  )

  return (
    <div className={s.page}>
      {flocks.some(f => f.age_weeks_at_acquisition != null && f.date_acquired) && (
        <div className={s.summaryBar} style={{ borderBottom: 'none', paddingBottom: 0 }}>
          {flocks.filter(f => f.age_weeks_at_acquisition != null && f.date_acquired).map(f => {
            const weeksElapsed = Math.floor(dayjs().diff(dayjs(f.date_acquired), 'day') / 7)
            const currentAge = f.age_weeks_at_acquisition + weeksElapsed
            const removed = data.reduce((sum, m) => m.flocks?.name === f.name ? sum + (m.count || 0) : sum, 0)
            const liveBirds = Math.max((f.initial_bird_count || 0) - removed, 0)
            return (
              <div key={f.id} className={s.kpiCard} style={{ borderLeft: `4px solid ${f.color || '#2563eb'}` }}>
                <div className={s.kpiLabel}>{f.name}</div>
                <div className={s.kpiValue}>{currentAge} <span style={{ fontSize: 14, fontWeight: 500 }}>wks old</span></div>
                <div className={s.kpiSub}>{liveBirds.toLocaleString()} live birds</div>
              </div>
            )
          })}
        </div>
      )}
      <div className={`${s.summaryBar} ${s.summaryGrid2}`}>
        <div className={`${s.kpiCard} ${s.kpiCard_red}`}>
          <div className={s.kpiLabel}>Total Removed</div>
          <div className={s.kpiValue}>{totalRemoved.toLocaleString()}</div>
          <div className={s.kpiSub}>{data.length} movement entries</div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiLabel}>Breakdown</div>
          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {Object.entries(byReason).map(([reason, count]) => (
              <div key={reason} style={{ fontSize: 13, color: '#374151', display: 'flex', justifyContent: 'space-between' }}>
                <span>{reason}</span>
                <strong>{count}</strong>
              </div>
            ))}
            {Object.keys(byReason).length === 0 && (
              <div style={{ fontSize: 13, color: '#94a3b8' }}>No movements</div>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className={s.sectionTitle}>Flock Movement Records</div>
        <Table columns={columns} data={data} emptyMessage="No flock movements for this month." />
      </div>
    </div>
  )
}
