import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useMonth } from '../utils/MonthContext'
import { formatCurrency, formatDate } from '../utils/format'
import Table from '../components/common/Table'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import s from './Screen.module.css'

const PIE_COLORS = [
  '#2563eb','#16a34a','#d97706','#dc2626','#7c3aed',
  '#0891b2','#be185d','#065f46','#92400e','#1e3a8a',
]

export default function Expenses() {
  const { monthYear } = useMonth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState([])
  const [salesTotal, setSalesTotal] = useState(0)
  const [openingBalance, setOpeningBalance] = useState(0)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase.from('expenses').select('*').eq('month_year', monthYear).order('date', { ascending: true }),
      supabase.from('sales').select('total_revenue').eq('month_year', monthYear),
      supabase.from('monthly_balance').select('opening_balance').eq('month_year', monthYear).single(),
    ]).then(([expRes, salesRes, balRes]) => {
      setData(expRes.data || [])
      const rev = (salesRes.data || []).reduce((sum, r) => sum + (r.total_revenue || 0), 0)
      setSalesTotal(rev)
      setOpeningBalance(balRes.data?.opening_balance || 0)
      setLoading(false)
    })
  }, [monthYear])

  const totalExpenses = data.reduce((sum, r) => sum + (r.amount || 0), 0)
  const totalCashIn = openingBalance + salesTotal
  const walletBalance = totalCashIn - totalExpenses
  const spentPct = totalCashIn > 0 ? Math.min((totalExpenses / totalCashIn) * 100, 100) : 0
  const isLow = walletBalance < totalCashIn * 0.2 && totalCashIn > 0

  const byCategory = data.reduce((acc, r) => {
    acc[r.category] = (acc[r.category] || 0) + (r.amount || 0)
    return acc
  }, {})
  const pieData = Object.entries(byCategory).map(([name, value]) => ({ name, value }))

  const columns = [
    { key: 'date', label: 'Date', width: 120, render: v => formatDate(v) },
    {
      key: 'category', label: 'Category',
      render: (v) => {
        const idx = pieData.findIndex(p => p.name === v)
        const color = PIE_COLORS[idx % PIE_COLORS.length] || '#6b7280'
        return (
          <span style={{ display:'inline-block', background: color + '1a', color, borderRadius:100, padding:'2px 10px', fontSize:12, fontWeight:600 }}>{v}</span>
        )
      }
    },
    {
      key: 'description', label: 'Description',
      render: (v, row) => {
        if (row.category === 'Feed' && (row.feed_type || row.quantity_kg)) {
          const parts = []
          if (row.feed_type) parts.push(row.feed_type)
          if (row.bags) parts.push(`${row.bags} bags`)
          if (row.quantity_kg) parts.push(`${row.quantity_kg} kg`)
          if (row.supplier) parts.push(`from ${row.supplier}`)
          return parts.join(' · ') || v || '—'
        }
        return v || <span style={{ color:'#9ca3af' }}>—</span>
      }
    },
    {
      key: 'payment_method', label: 'Payment',
      render: v => <span style={{ display:'inline-block', background:'#f1f5f9', color:'#475569', borderRadius:100, padding:'2px 10px', fontSize:12, fontWeight:600 }}>{v || 'Cash'}</span>
    },
    { key: 'amount', label: 'Amount', align: 'right', render: v => <strong style={{ color:'#dc2626' }}>{formatCurrency(v)}</strong> },
  ]

  return (
    <div className={s.page}>
      <div className={s.statsRow}>
        {/* Wallet card */}
        <div className={s.card} style={{ flex: 2, minWidth: 260 }}>
          <div className={s.cardLabel}>Wallet Balance</div>
          <div className={s.cardValue} style={{ color: walletBalance < 0 ? '#dc2626' : isLow ? '#d97706' : '#16a34a' }}>
            {formatCurrency(walletBalance)}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:4, marginTop:12, fontSize:13 }}>
            <div style={{ display:'flex', justifyContent:'space-between', color:'#64748b' }}>
              <span>Opening Balance</span><span>{formatCurrency(openingBalance)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', color:'#64748b' }}>
              <span>+ Cash Received</span><span style={{ color:'#16a34a' }}>{formatCurrency(salesTotal)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', color:'#64748b' }}>
              <span>Total Cash In</span><span style={{ fontWeight:600 }}>{formatCurrency(totalCashIn)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', color:'#64748b' }}>
              <span>− Expenses</span><span style={{ color:'#dc2626' }}>{formatCurrency(totalExpenses)}</span>
            </div>
          </div>
          <div style={{ marginTop:14 }}>
            <div style={{ height:8, borderRadius:8, background:'#e2e8f0', overflow:'hidden' }}>
              <div style={{ height:'100%', borderRadius:8, width:`${spentPct}%`, background: walletBalance < 0 ? '#dc2626' : isLow ? '#d97706' : '#16a34a', transition:'width 0.4s' }} />
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#94a3b8', marginTop:4 }}>
              <span>{spentPct.toFixed(0)}% spent</span>
              <span>{(100 - spentPct).toFixed(0)}% remaining</span>
            </div>
          </div>
        </div>

        <div className={s.card} style={{ flex: 1, minWidth: 120 }}>
          <div className={s.cardLabel}>Total Expenses</div>
          <div className={s.cardValue} style={{ color:'#dc2626' }}>{formatCurrency(totalExpenses)}</div>
          <div className={s.cardSub}>{data.length} transactions</div>
        </div>

        <div className={s.card} style={{ flex: 1, minWidth: 120 }}>
          <div className={s.cardLabel}>Categories</div>
          <div className={s.cardValue}>{pieData.length}</div>
          <div className={s.cardSub}>expense types</div>
        </div>
      </div>

      {/* Category breakdown + pie */}
      {pieData.length > 0 && (
        <div className={s.card} style={{ display:'flex', gap:24, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ flex: 2, minWidth: 200 }}>
            <div className={s.sectionTitle} style={{ marginBottom:12 }}>By Category</div>
            {pieData.map((c, i) => (
              <div key={c.name} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                <div style={{ width:10, height:10, borderRadius:'50%', background:PIE_COLORS[i % PIE_COLORS.length], flexShrink:0 }} />
                <span style={{ flex:1, fontSize:13, color:'#374151' }}>{c.name}</span>
                <div style={{ flex:2, height:6, borderRadius:6, background:'#f1f5f9', overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${totalExpenses > 0 ? (c.value/totalExpenses)*100 : 0}%`, background:PIE_COLORS[i % PIE_COLORS.length], borderRadius:6 }} />
                </div>
                <span style={{ fontSize:11, color:'#94a3b8', width:32, textAlign:'right' }}>{totalExpenses > 0 ? ((c.value/totalExpenses)*100).toFixed(0) : 0}%</span>
                <span style={{ fontSize:13, fontWeight:600, color:'#0f172a', width:90, textAlign:'right' }}>{formatCurrency(c.value)}</span>
              </div>
            ))}
          </div>
          <div style={{ width:160, flexShrink:0 }}>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={68} paddingAngle={3}>
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />)}
                </Pie>
                <Tooltip formatter={v => formatCurrency(v)} contentStyle={{ fontSize:12, borderRadius:8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className={s.tableCard}>
        <div className={s.tableHeader}>
          <span className={s.tableTitle}>Expense Records</span>
          <span style={{ fontSize:13, color:'#64748b' }}>{data.length} record{data.length !== 1 ? 's' : ''} this month</span>
        </div>
        {loading
          ? <div className={s.loading}><div className={s.spinner} /></div>
          : <Table columns={columns} data={data} emptyMessage="No expenses recorded for this month." />
        }
      </div>
    </div>
  )
}
