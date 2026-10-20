import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useMonth } from '../utils/MonthContext'
import { formatCurrency, formatDate } from '../utils/format'
import Table from '../components/common/Table'
import s from './Screen.module.css'

export default function HealthRecords() {
  const { monthYear } = useMonth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState([])

  useEffect(() => {
    setLoading(true)
    supabase
      .from('health_records')
      .select('*, flocks(name)')
      .eq('month_year', monthYear)
      .order('date', { ascending: true })
      .then(({ data: rows }) => {
        setData(rows || [])
        setLoading(false)
      })
  }, [monthYear])

  const totalCost = data.reduce((sum, r) => sum + (r.cost || 0), 0)
  const eventCount = data.length

  const columns = [
    { key: 'date', label: 'Date', width: 120, render: (v) => formatDate(v) },
    { key: 'flock_id', label: 'Flock', render: (_, row) => row.flocks?.name || '—' },
    { key: 'record_type', label: 'Type', render: (v) => v || '—' },
    { key: 'product_name', label: 'Name / Product', render: (v) => v || '—' },
    { key: 'dosage', label: 'Dosage', render: (v) => v || '—' },
    {
      key: 'cost',
      label: 'Cost',
      align: 'right',
      render: (v) => v != null ? formatCurrency(v) : '—',
    },
    {
      key: 'next_due_date',
      label: 'Next Due',
      render: (v) => v ? formatDate(v) : '—',
    },
    { key: 'notes', label: 'Notes', render: (v) => v || '—' },
  ]

  if (loading) return (
    <div className={s.loading}>
      <div className={s.spinner} />
      <span>Loading health records…</span>
    </div>
  )

  return (
    <div className={s.page}>
      <div className={`${s.summaryBar} ${s.summaryGrid2}`}>
        <div className={`${s.kpiCard} ${s.kpiCard_blue}`}>
          <div className={s.kpiLabel}>Health Events</div>
          <div className={s.kpiValue}>{eventCount}</div>
          <div className={s.kpiSub}>Vaccinations, treatments &amp; checks</div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiLabel}>Total Cost</div>
          <div className={s.kpiValue}>{formatCurrency(totalCost)}</div>
          <div className={s.kpiSub}>Health expenditure</div>
        </div>
      </div>

      <div>
        <div className={s.sectionTitle}>Health Records</div>
        <Table columns={columns} data={data} emptyMessage="No health records for this month." />
      </div>
    </div>
  )
}
