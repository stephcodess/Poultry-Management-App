import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useMonth } from '../utils/MonthContext'
import { formatCurrency, formatDate } from '../utils/format'
import Table from '../components/common/Table'
import s from './Screen.module.css'

function PayBadge({ status, creditStatus, customerName }) {
  const customer = customerName ? ` · ${customerName}` : ''
  if (!status || status === 'cash') {
    return <span style={{ display:'inline-block', background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0', borderRadius:100, padding:'2px 10px', fontSize:12, fontWeight:600 }}>Cash</span>
  }
  if (creditStatus === 'paid') {
    return <span style={{ display:'inline-block', background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0', borderRadius:100, padding:'2px 10px', fontSize:12, fontWeight:600 }} title={customerName}>Paid{customer}</span>
  }
  if (creditStatus === 'partial') {
    return <span style={{ display:'inline-block', background:'#eff6ff', color:'#2563eb', border:'1px solid #bfdbfe', borderRadius:100, padding:'2px 10px', fontSize:12, fontWeight:600, maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={customerName}>Part Paid{customer}</span>
  }
  return <span style={{ display:'inline-block', background:'#fff7ed', color:'#d97706', border:'1px solid #fed7aa', borderRadius:100, padding:'2px 10px', fontSize:12, fontWeight:600, maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={customerName}>Credit{customer}</span>
}

export default function Sales() {
  const { monthYear } = useMonth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState([])

  useEffect(() => {
    setLoading(true)
    supabase
      .from('sales')
      .select('*, flocks(name, color), credit_customers(name)')
      .eq('month_year', monthYear)
      .order('date', { ascending: true })
      .then(({ data: rows }) => {
        setData(rows || [])
        setLoading(false)
      })
  }, [monthYear])

  const totalRevenue = data.reduce((sum, r) => sum + (r.total_revenue || 0), 0)
  const totalCrates  = data.reduce((sum, r) => sum + (r.crates || 0), 0)
  const totalPieces  = data.reduce((sum, r) => sum + (r.pieces || 0), 0)
  const creditCount  = data.filter(r => r.payment_status === 'credit').length

  const columns = [
    { key: 'date', label: 'Date', width: 120, render: v => formatDate(v) },
    {
      key: 'egg_size', label: 'Size',
      render: v => <span style={{ display:'inline-block', background:'#eff6ff', color:'#2563eb', borderRadius:100, padding:'2px 10px', fontSize:12, fontWeight:600 }}>{v || '—'}</span>
    },
    { key: 'price_per_crate', label: 'Price/Crate', align: 'right', render: v => v != null ? formatCurrency(v) : '—' },
    {
      key: 'flock_id', label: 'Flock',
      render: (_, row) => (
        <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
          {row.flocks?.color && <span style={{ width:10, height:10, borderRadius:'50%', background:row.flocks.color, display:'inline-block', flexShrink:0 }} />}
          {row.flocks?.name || '—'}
        </span>
      ),
    },
    { key: 'crates', label: 'Crates', align: 'right' },
    { key: 'pieces', label: 'Pieces', align: 'right' },
    { key: 'total_revenue', label: 'Revenue', align: 'right', render: v => <span style={{ fontWeight:700, color:'#16a34a' }}>{formatCurrency(v || 0)}</span> },
    {
      key: 'payment_status', label: 'Payment',
      render: (v, row) => <PayBadge status={v} creditStatus={row.credit_status} customerName={row.credit_customers?.name} />
    },
  ]

  if (loading) return (
    <div className={s.loading}><div className={s.spinner} /><span>Loading sales…</span></div>
  )

  return (
    <div className={s.page}>
      <div className={`${s.summaryBar} ${s.summaryGrid4}`}>
        <div className={`${s.kpiCard} ${s.kpiCard_green}`}>
          <div className={s.kpiLabel}>Gross Revenue</div>
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
          <div className={s.kpiValue}>{totalCrates > 0 ? formatCurrency(Math.round(totalRevenue / totalCrates)) : '—'}</div>
          <div className={s.kpiSub}>Weighted average</div>
        </div>
        <div className={`${s.kpiCard} ${creditCount > 0 ? s.kpiCard_red : s.kpiCard}`}>
          <div className={s.kpiLabel}>Credit Sales</div>
          <div className={s.kpiValue}>{creditCount}</div>
          <div className={s.kpiSub}>Unpaid / outstanding</div>
        </div>
      </div>

      <div>
        <div className={s.sectionTitle}>Sales Records</div>
        <Table columns={columns} data={data} emptyMessage="No sales records for this month." />
      </div>
    </div>
  )
}
