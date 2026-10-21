import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { formatCurrency, formatDate } from '../utils/format'
import Table from '../components/common/Table'
import s from './Screen.module.css'

function StatusBadge({ status }) {
  const map = {
    paid:    { bg:'#dcfce7', color:'#166534', label:'✓ Paid' },
    partial: { bg:'#fef3c7', color:'#92400e', label:'Partial' },
    unpaid:  { bg:'#fee2e2', color:'#991b1b', label:'Unpaid' },
  }
  const st = map[status] || map.unpaid
  return (
    <span style={{ background:st.bg, color:st.color, padding:'2px 10px', borderRadius:100, fontSize:12, fontWeight:600, display:'inline-block' }}>
      {st.label}
    </span>
  )
}

export default function Debtors() {
  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState([])
  const [selected, setSelected] = useState(null)
  const [sales, setSales] = useState([])
  const [salesLoading, setSalesLoading] = useState(false)
  const [payments, setPayments] = useState([])
  const [showPayments, setShowPayments] = useState(null) // sale object

  useEffect(() => {
    loadCustomers()
  }, [])

  async function loadCustomers() {
    setLoading(true)
    const { data: creditSales } = await supabase
      .from('credit_sales')
      .select('customer_id, amount_owed, amount_paid, status')

    const { data: customerRows } = await supabase
      .from('credit_customers')
      .select('*')
      .order('name')

    const enriched = (customerRows || []).map(c => {
      const cSales = (creditSales || []).filter(s => s.customer_id === c.id)
      const total_owed = cSales.reduce((sum, s) => sum + (s.amount_owed || 0), 0)
      const total_paid = cSales.reduce((sum, s) => sum + (s.amount_paid || 0), 0)
      const outstanding = Math.max(0, total_owed - total_paid)
      return { ...c, total_owed, total_paid, outstanding, total_sales: cSales.length }
    })

    setCustomers(enriched)
    if (selected) {
      const updated = enriched.find(c => c.id === selected.id)
      if (updated) setSelected(updated)
    }
    setLoading(false)
  }

  async function loadSales(customerId) {
    setSalesLoading(true)
    const { data } = await supabase
      .from('credit_sales')
      .select('*')
      .eq('customer_id', customerId)
      .order('date', { ascending: false })
    setSales(data || [])
    setSalesLoading(false)
  }

  async function loadPayments(saleId) {
    const { data } = await supabase
      .from('debt_payments')
      .select('*')
      .eq('credit_sale_id', saleId)
      .order('date', { ascending: false })
    setPayments(data || [])
  }

  function selectCustomer(c) {
    setSelected(c)
    setShowPayments(null)
    loadSales(c.id)
  }

  const totalOutstanding = customers.reduce((s, c) => s + (c.outstanding || 0), 0)
  const customersWithDebt = customers.filter(c => (c.outstanding || 0) > 0).length

  const saleColumns = [
    { key: 'date', label: 'Date', width: 110, render: v => formatDate(v) },
    { key: 'month_year', label: 'Month', width: 90 },
    { key: 'egg_size', label: 'Size', width: 70 },
    { key: 'crates', label: 'Eggs', render: (v, row) => `${v || 0} cr ${row.pieces || 0} pcs` },
    { key: 'amount_owed', label: 'Owed', align: 'right', render: v => formatCurrency(v) },
    { key: 'amount_paid', label: 'Paid', align: 'right', render: v => <span style={{ color:'#16a34a' }}>{formatCurrency(v)}</span> },
    {
      key: 'status', label: 'Status', align: 'center',
      render: v => <StatusBadge status={v} />
    },
    {
      key: 'actions', label: '', align: 'right', width: 90,
      render: (_, row) => (
        <button
          onClick={() => { setShowPayments(row); loadPayments(row.id) }}
          style={{ fontSize:12, padding:'3px 10px', borderRadius:6, border:'1px solid #e2e8f0', background:'#f8fafc', color:'#374151', cursor:'pointer', fontWeight:600 }}
        >
          History
        </button>
      )
    },
  ]

  const paymentColumns = [
    { key: 'date', label: 'Date', render: v => formatDate(v) },
    { key: 'payment_method', label: 'Method' },
    { key: 'amount', label: 'Amount', align: 'right', render: v => <span style={{ color:'#16a34a', fontWeight:600 }}>{formatCurrency(v)}</span> },
    { key: 'notes', label: 'Notes', render: v => v || <span style={{ color:'#9ca3af' }}>—</span> },
  ]

  return (
    <div className={s.page}>
      <div className={s.statsRow}>
        <div className={s.card}>
          <div className={s.cardLabel}>Total Outstanding</div>
          <div className={s.cardValue} style={{ color:'#dc2626' }}>{formatCurrency(totalOutstanding)}</div>
          <div className={s.cardSub}>across all customers</div>
        </div>
        <div className={s.card}>
          <div className={s.cardLabel}>Customers with Debt</div>
          <div className={s.cardValue}>{customersWithDebt}</div>
          <div className={s.cardSub}>of {customers.length} total</div>
        </div>
        <div className={s.card}>
          <div className={s.cardLabel}>Total Customers</div>
          <div className={s.cardValue}>{customers.length}</div>
          <div className={s.cardSub}>credit accounts</div>
        </div>
      </div>

      <div style={{ display:'flex', gap:16, alignItems:'flex-start', minHeight:400 }}>
        {/* Customer list */}
        <div className={s.card} style={{ width:260, flexShrink:0, padding:0, overflow:'hidden' }}>
          <div style={{ padding:'14px 16px', borderBottom:'1px solid #f1f5f9', fontWeight:700, fontSize:14, color:'#0f172a' }}>
            Credit Customers
          </div>
          {loading
            ? <div className={s.loading}><div className={s.spinner} /></div>
            : customers.length === 0
              ? <div style={{ padding:24, textAlign:'center', color:'#94a3b8', fontSize:13 }}>No credit customers.</div>
              : customers.map(c => (
                <div
                  key={c.id}
                  onClick={() => selectCustomer(c)}
                  style={{
                    padding:'12px 16px', borderBottom:'1px solid #f8fafc', cursor:'pointer',
                    background: selected?.id === c.id ? '#eff6ff' : '#fff',
                    borderLeft: selected?.id === c.id ? '3px solid #2563eb' : '3px solid transparent',
                    transition:'background 0.1s',
                  }}
                >
                  <div style={{ fontWeight:600, fontSize:14, color:'#0f172a' }}>{c.name}</div>
                  {c.phone && <div style={{ fontSize:12, color:'#94a3b8', marginTop:2 }}>{c.phone}</div>}
                  <div style={{ marginTop:4 }}>
                    {c.outstanding > 0
                      ? <span style={{ fontSize:12, fontWeight:600, color:'#dc2626' }}>Owes {formatCurrency(c.outstanding)}</span>
                      : <span style={{ fontSize:12, fontWeight:600, color:'#16a34a' }}>Paid up</span>
                    }
                  </div>
                </div>
              ))
          }
        </div>

        {/* Right: sales or payment history */}
        <div style={{ flex:1, minWidth:0 }}>
          {!selected ? (
            <div className={s.card} style={{ textAlign:'center', padding:48, color:'#94a3b8' }}>
              Select a customer to view their credit sales
            </div>
          ) : showPayments ? (
            <div className={s.tableCard}>
              <div className={s.tableHeader}>
                <div>
                  <div className={s.tableTitle}>Payment History</div>
                  <div style={{ fontSize:12, color:'#64748b' }}>{showPayments.egg_size} · {formatDate(showPayments.date)} · Owed {formatCurrency(showPayments.amount_owed)}</div>
                </div>
                <button
                  onClick={() => setShowPayments(null)}
                  style={{ fontSize:12, padding:'4px 12px', borderRadius:6, border:'1px solid #e2e8f0', background:'#f8fafc', color:'#374151', cursor:'pointer', fontWeight:600 }}
                >
                  ← Back to Sales
                </button>
              </div>
              <Table columns={paymentColumns} data={payments} emptyMessage="No payments recorded." />
            </div>
          ) : (
            <>
              <div className={s.card} style={{ marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12 }}>
                  <div>
                    <div style={{ fontSize:18, fontWeight:800, color:'#0f172a' }}>{selected.name}</div>
                    {selected.phone && <div style={{ fontSize:13, color:'#64748b', marginTop:2 }}>{selected.phone}</div>}
                  </div>
                  <div style={{ display:'flex', gap:24 }}>
                    <div style={{ textAlign:'center' }}>
                      <div style={{ fontSize:18, fontWeight:800, color:'#0f172a' }}>{formatCurrency(selected.total_owed || 0)}</div>
                      <div style={{ fontSize:11, color:'#94a3b8' }}>Total Owed ({selected.total_sales} sales)</div>
                    </div>
                    <div style={{ textAlign:'center' }}>
                      <div style={{ fontSize:18, fontWeight:800, color:'#16a34a' }}>{formatCurrency(selected.total_paid || 0)}</div>
                      <div style={{ fontSize:11, color:'#94a3b8' }}>Total Paid</div>
                    </div>
                    <div style={{ textAlign:'center' }}>
                      <div style={{ fontSize:18, fontWeight:800, color:(selected.outstanding||0) > 0 ? '#dc2626' : '#16a34a' }}>{formatCurrency(selected.outstanding || 0)}</div>
                      <div style={{ fontSize:11, color:'#94a3b8' }}>Outstanding</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={s.tableCard}>
                <div className={s.tableHeader}>
                  <span className={s.tableTitle}>Credit Sales</span>
                </div>
                {salesLoading
                  ? <div className={s.loading}><div className={s.spinner} /></div>
                  : <Table columns={saleColumns} data={sales} emptyMessage="No credit sales for this customer." />
                }
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
