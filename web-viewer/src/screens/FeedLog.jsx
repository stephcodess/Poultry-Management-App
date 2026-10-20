import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useMonth } from '../utils/MonthContext'
import { formatCurrency, formatDate } from '../utils/format'
import Table from '../components/common/Table'
import s from './Screen.module.css'

export default function FeedLog() {
  const { monthYear } = useMonth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState([])

  useEffect(() => {
    setLoading(true)
    supabase
      .from('feed_log')
      .select('*, flocks(name)')
      .eq('month_year', monthYear)
      .order('date', { ascending: true })
      .then(({ data: rows }) => {
        setData(rows || [])
        setLoading(false)
      })
  }, [monthYear])

  const totalKg = data.reduce((sum, r) => sum + (r.quantity_kg || 0), 0)
  const totalCost = data.reduce((sum, r) => sum + (r.total_cost || 0), 0)

  const columns = [
    { key: 'date', label: 'Date', width: 120, render: (v) => formatDate(v) },
    { key: 'flock_id', label: 'Flock', render: (_, row) => row.flocks?.name || '—' },
    { key: 'feed_type', label: 'Feed Type', render: (v) => v || '—' },
    {
      key: 'quantity_kg',
      label: 'Qty (kg)',
      align: 'right',
      render: (v) => v != null ? `${Number(v).toLocaleString()} kg` : '—',
    },
    {
      key: 'cost_per_kg',
      label: 'Cost/kg',
      align: 'right',
      render: (v) => v != null ? formatCurrency(v) : '—',
    },
    {
      key: 'total_cost',
      label: 'Total Cost',
      align: 'right',
      render: (v) => formatCurrency(v || 0),
    },
    { key: 'supplier', label: 'Supplier', render: (v) => v || '—' },
    { key: 'notes', label: 'Notes', render: (v) => v || '—' },
  ]

  if (loading) return (
    <div className={s.loading}>
      <div className={s.spinner} />
      <span>Loading feed log…</span>
    </div>
  )

  return (
    <div className={s.page}>
      <div className={`${s.summaryBar} ${s.summaryGrid3}`}>
        <div className={`${s.kpiCard} ${s.kpiCard_blue}`}>
          <div className={s.kpiLabel}>Total Feed</div>
          <div className={s.kpiValue}>{totalKg.toLocaleString()} kg</div>
          <div className={s.kpiSub}>{data.length} feed entries</div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiLabel}>Total Cost</div>
          <div className={s.kpiValue}>{formatCurrency(totalCost)}</div>
          <div className={s.kpiSub}>Feed expenditure</div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiLabel}>Avg Cost/kg</div>
          <div className={s.kpiValue}>
            {totalKg > 0 ? formatCurrency(Math.round(totalCost / totalKg)) : '—'}
          </div>
          <div className={s.kpiSub}>Weighted average</div>
        </div>
      </div>

      <div>
        <div className={s.sectionTitle}>Feed Log</div>
        <Table columns={columns} data={data} emptyMessage="No feed records for this month." />
      </div>
    </div>
  )
}
