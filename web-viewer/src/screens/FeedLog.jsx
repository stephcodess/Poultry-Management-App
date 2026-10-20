import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useMonth } from '../utils/MonthContext'
import { formatDate } from '../utils/format'
import Table from '../components/common/Table'
import s from './Screen.module.css'

function StockByTypePanel({ byType }) {
  const [open, setOpen] = useState(true)
  if (!byType || byType.length === 0) return null
  return (
    <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, overflow:'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', background:'#f8fafc', border:'none', borderBottom: open ? '1px solid #e2e8f0' : 'none', cursor:'pointer', fontFamily:'inherit' }}
      >
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:20 }}>🌾</span>
          <span style={{ fontSize:16, fontWeight:700, color:'#0f172a' }}>Stock by Feed Type</span>
          <span style={{ fontSize:13, color:'#64748b' }}>{byType.length} type{byType.length !== 1 ? 's' : ''}</span>
        </div>
        <span style={{ fontSize:13, color:'#64748b' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:12, padding:16 }}>
          {byType.map(t => {
            const pct = t.purchased_kg > 0 ? (t.stock_kg / t.purchased_kg) * 100 : 0
            const color = t.stock_kg <= 0 ? '#dc2626' : t.stock_kg < 50 ? '#d97706' : '#16a34a'
            return (
              <div key={t.feed_type} style={{ background:'#f9fafb', borderRadius:10, padding:'14px 16px', border:`1.5px solid ${color}33`, display:'flex', flexDirection:'column', gap:6 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em' }}>{t.feed_type}</div>
                <div style={{ fontSize:26, fontWeight:800, color, lineHeight:1.1 }}>{t.stock_kg.toFixed(1)} <span style={{ fontSize:16, fontWeight:600 }}>kg</span></div>
                <div style={{ height:5, background:'#e2e8f0', borderRadius:100, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${Math.min(pct, 100)}%`, background:color, borderRadius:100 }} />
                </div>
                <div style={{ fontSize:13, color:'#64748b', display:'flex', justifyContent:'space-between' }}>
                  <span>📥 {t.purchased_kg.toFixed(1)} kg in</span>
                  <span>📤 {t.consumed_kg.toFixed(1)} kg used</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function FeedLog() {
  const { monthYear } = useMonth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState([])
  const [stockByType, setStockByType] = useState([])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase.from('feed_log').select('*, flocks(name)').eq('month_year', monthYear).order('date', { ascending: true }),
      supabase.from('expenses').select('feed_type, quantity_kg, bags').eq('category', 'Feed'),
      supabase.from('feed_log').select('feed_type, quantity_kg'),
    ]).then(([feedRes, purchasedRes, consumedRes]) => {
      setData(feedRes.data || [])

      // Build stock by type
      const purchased = purchasedRes.data || []
      const consumed = consumedRes.data || []
      const purchasedMap = {}
      purchased.forEach(r => {
        if (!r.feed_type) return
        const kg = r.quantity_kg > 0 ? r.quantity_kg : (r.bags || 0) * 25
        purchasedMap[r.feed_type] = (purchasedMap[r.feed_type] || 0) + kg
      })
      const consumedMap = {}
      consumed.forEach(r => {
        if (!r.feed_type) return
        consumedMap[r.feed_type] = (consumedMap[r.feed_type] || 0) + (r.quantity_kg || 0)
      })
      const byType = Object.keys(purchasedMap).map(ft => ({
        feed_type: ft,
        purchased_kg: purchasedMap[ft],
        consumed_kg: consumedMap[ft] || 0,
        stock_kg: Math.max(purchasedMap[ft] - (consumedMap[ft] || 0), 0),
      }))
      setStockByType(byType)
      setLoading(false)
    })
  }, [monthYear])

  const totalKg = data.reduce((sum, r) => sum + (r.quantity_kg || 0), 0)

  const columns = [
    { key: 'date', label: 'Date', width: 120, render: v => formatDate(v) },
    { key: 'flock_id', label: 'Flock', render: (_, row) => row.flocks?.name || 'All Flocks' },
    { key: 'feed_type', label: 'Feed Type', render: v => v || '—' },
    { key: 'quantity_kg', label: 'Consumed (kg)', align: 'right', render: v => v != null ? `${Number(v).toLocaleString()} kg` : '—' },
    { key: 'notes', label: 'Notes', render: v => v || '—' },
  ]

  if (loading) return (
    <div className={s.loading}><div className={s.spinner} /><span>Loading feed log…</span></div>
  )

  return (
    <div className={s.page}>
      <div className={`${s.summaryBar} ${s.summaryGrid3}`}>
        <div className={`${s.kpiCard} ${s.kpiCard_blue}`}>
          <div className={s.kpiLabel}>Used This Month</div>
          <div className={s.kpiValue}>{totalKg.toLocaleString()} kg</div>
          <div className={s.kpiSub}>{data.length} feed entries</div>
        </div>
        <div className={`${s.kpiCard} ${s.kpiCard_green}`}>
          <div className={s.kpiLabel}>Total Stock on Hand</div>
          <div className={s.kpiValue}>{stockByType.reduce((s, t) => s + t.stock_kg, 0).toFixed(1)} kg</div>
          <div className={s.kpiSub}>Across all feed types</div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiLabel}>Feed Types</div>
          <div className={s.kpiValue}>{stockByType.length}</div>
          <div className={s.kpiSub}>In stock</div>
        </div>
      </div>

      <StockByTypePanel byType={stockByType} />

      <div>
        <div className={s.sectionTitle}>Feed Usage Log</div>
        <Table columns={columns} data={data} emptyMessage="No feed records for this month." />
      </div>
    </div>
  )
}
