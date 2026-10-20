import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useMonth } from '../utils/MonthContext'
import { formatCurrency, formatEggs, formatDate } from '../utils/format'
import Table from '../components/common/Table'
import s from './Screen.module.css'

export default function Production() {
  const { monthYear } = useMonth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState([])

  useEffect(() => {
    setLoading(true)
    supabase
      .from('production')
      .select('*, flocks(name, color)')
      .eq('month_year', monthYear)
      .order('date', { ascending: true })
      .then(({ data: rows }) => {
        setData(rows || [])
        setLoading(false)
      })
  }, [monthYear])

  const totalEggs = data.reduce((sum, r) => sum + (r.total_eggs || 0), 0)
  const avgYield = data.length
    ? (data.reduce((sum, r) => sum + (r.yield_percent || 0), 0) / data.length).toFixed(1)
    : '0.0'
  const totalBirds = data.reduce((sum, r) => sum + (r.bird_count || 0), 0)

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
    { key: 'bird_count', label: 'Birds', align: 'right', render: (v) => v?.toLocaleString() || '—' },
    {
      key: 'total_eggs',
      label: 'Crates + Pieces',
      render: (v) => formatEggs(v || 0),
    },
    { key: 'total_eggs', label: 'Total Eggs', align: 'right', render: (v) => (v || 0).toLocaleString() },
    {
      key: 'yield_percent',
      label: 'Yield %',
      align: 'right',
      render: (v) => v != null ? `${Number(v).toFixed(1)}%` : '—',
    },
  ]

  if (loading) return (
    <div className={s.loading}>
      <div className={s.spinner} />
      <span>Loading production…</span>
    </div>
  )

  return (
    <div className={s.page}>
      <div className={`${s.summaryBar} ${s.summaryGrid3}`}>
        <div className={`${s.kpiCard} ${s.kpiCard_blue}`}>
          <div className={s.kpiLabel}>Total Eggs</div>
          <div className={s.kpiValue}>{formatEggs(totalEggs)}</div>
          <div className={s.kpiSub}>{totalEggs.toLocaleString()} pieces</div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiLabel}>Avg Yield</div>
          <div className={s.kpiValue}>{avgYield}%</div>
          <div className={s.kpiSub}>Across {data.length} records</div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiLabel}>Records</div>
          <div className={s.kpiValue}>{data.length}</div>
          <div className={s.kpiSub}>Daily entries</div>
        </div>
      </div>

      <div>
        <div className={s.sectionTitle}>Production Records</div>
        <Table columns={columns} data={data} emptyMessage="No production records for this month." />
      </div>
    </div>
  )
}
