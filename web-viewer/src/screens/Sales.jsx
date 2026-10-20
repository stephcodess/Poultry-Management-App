import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useMonth } from '../utils/MonthContext'
import { formatCurrency, formatDate } from '../utils/format'
import Table from '../components/common/Table'
import s from './Screen.module.css'

export default function Sales() {
  const { monthYear } = useMonth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState([])

  useEffect(() => {
    setLoading(true)
    supabase
      .from('sales')
      .select('*, flocks(name, color)')
      .eq('month_year', monthYear)
      .order('date', { ascending: true })
      .then(({ data: rows }) => {
        setData(rows || [])
        setLoading(false)
      })
  }, [monthYear])

  const totalRevenue = data.reduce((sum, r) => sum + (r.total_revenue || 0), 0)
  const totalCrates = data.reduce((sum, r) => sum + (r.quantity_crates || 0), 0)
  const totalPieces = data.reduce((sum, r) => sum + (r.quantity_pieces || 0), 0)
  const totalQty = totalCrates * 30 + totalPieces

  const columns = [
    { key: 'date', label: 'Date', width: 120, render: (v) => formatDate(v) },
    { key: 'egg_size', label: 'Egg Size', render: (v) => v || '—' },
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
    {
      key: 'quantity_crates',
      label: 'Quantity',
      render: (_, row) => {
        const c = row.quantity_crates || 0
        const p = row.quantity_pieces || 0
        if (c && p) return `${c} crates, ${p} pcs`
        if (c) return `${c} crates`
        return `${p} pcs`
      },
    },
    {
      key: 'price_per_crate',
      label: 'Price/Crate',
      align: 'right',
      render: (v) => v != null ? formatCurrency(v) : '—',
    },
    {
      key: 'total_revenue',
      label: 'Revenue',
      align: 'right',
      render: (v) => formatCurrency(v || 0),
    },
  ]

  if (loading) return (
    <div className={s.loading}>
      <div className={s.spinner} />
      <span>Loading sales…</span>
    </div>
  )

  return (
    <div className={s.page}>
      <div className={`${s.summaryBar} ${s.summaryGrid3}`}>
        <div className={`${s.kpiCard} ${s.kpiCard_green}`}>
          <div className={s.kpiLabel}>Total Revenue</div>
          <div className={s.kpiValue}>{formatCurrency(totalRevenue)}</div>
          <div className={s.kpiSub}>{data.length} transactions</div>
        </div>
        <div className={`${s.kpiCard} ${s.kpiCard_blue}`}>
          <div className={s.kpiLabel}>Crates Sold</div>
          <div className={s.kpiValue}>{totalCrates.toLocaleString()}</div>
          <div className={s.kpiSub}>+ {totalPieces} loose pieces</div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiLabel}>Avg per Crate</div>
          <div className={s.kpiValue}>
            {totalCrates > 0 ? formatCurrency(Math.round(totalRevenue / totalCrates)) : '—'}
          </div>
          <div className={s.kpiSub}>Weighted average</div>
        </div>
      </div>

      <div>
        <div className={s.sectionTitle}>Sales Records</div>
        <Table columns={columns} data={data} emptyMessage="No sales records for this month." />
      </div>
    </div>
  )
}
