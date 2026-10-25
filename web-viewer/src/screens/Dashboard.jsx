import React, { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '../supabaseClient'
import { useMonth } from '../utils/MonthContext'
import { formatCurrency, formatEggs } from '../utils/format'
import dayjs from 'dayjs'
import s from './Screen.module.css'

export default function Dashboard() {
  const { monthYear } = useMonth()
  const [loading, setLoading] = useState(true)
  const [production, setProduction] = useState([])
  const [sales, setSales] = useState([])
  const [expenses, setExpenses] = useState([])
  const [flocks, setFlocks] = useState([])
  const [movements, setMovements] = useState([])
  const [cashReceived, setCashReceived] = useState(0)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase.from('production').select('date, total_eggs, flock_id').eq('month_year', monthYear),
      supabase.from('sales').select('total_revenue, payment_status').eq('month_year', monthYear),
      supabase.from('expenses').select('amount').eq('month_year', monthYear),
      supabase.from('flocks').select('*').eq('is_active', 1),
      supabase.from('flock_movements').select('flock_id, count'),
      supabase.from('credit_sales').select('amount_paid, month_year').eq('month_year', monthYear),
      supabase.from('debt_payments').select('amount, month_year').eq('month_year', monthYear),
    ]).then(([prod, sal, exp, fl, mov, cs, dp]) => {
      setProduction(prod.data || [])
      setSales(sal.data || [])
      setExpenses(exp.data || [])
      setFlocks(fl.data || [])
      setMovements(mov.data || [])
      // cash received = cash sales + credit deposits + debt repayments
      const cashSales = (sal.data || []).filter(r => !r.payment_status || r.payment_status === 'cash').reduce((s, r) => s + (r.total_revenue || 0), 0)
      const deposits = (cs.data || []).reduce((s, r) => s + (r.amount_paid || 0), 0)
      const repayments = (dp.data || []).reduce((s, r) => s + (r.amount || 0), 0)
      setCashReceived(cashSales + deposits + repayments)
      setLoading(false)
    })
  }, [monthYear])

  const totalProduced = production.reduce((sum, r) => sum + (r.total_eggs || 0), 0)
  const grossRevenue  = sales.reduce((sum, r) => sum + (r.total_revenue || 0), 0)
  const totalExpenses = expenses.reduce((sum, r) => sum + (r.amount || 0), 0)
  const netProfit = cashReceived - totalExpenses

  function getBirdCount(flockId, initialCount) {
    const removed = movements
      .filter(m => m.flock_id === flockId)
      .reduce((sum, m) => sum + (m.count || 0), 0)
    return (initialCount || 0) - removed
  }

  const chartData = Object.values(
    production.reduce((acc, r) => {
      const key = r.date
      if (!acc[key]) acc[key] = { date: dayjs(r.date).format('DD MMM'), total_eggs: 0 }
      acc[key].total_eggs += r.total_eggs || 0
      return acc
    }, {})
  ).sort((a, b) => a.date > b.date ? 1 : -1)

  if (loading) return (
    <div className={s.loading}>
      <div className={s.spinner} />
      <span>Loading dashboard…</span>
    </div>
  )

  return (
    <div className={s.page}>
      <div className={`${s.summaryBar} ${s.summaryGrid4}`}>
        <div className={`${s.kpiCard} ${s.kpiCard_blue}`}>
          <div className={s.kpiLabel}>Total Production</div>
          <div className={s.kpiValue}>{formatEggs(totalProduced)}</div>
          <div className={s.kpiSub}>{totalProduced.toLocaleString()} eggs</div>
        </div>
        <div className={`${s.kpiCard} ${s.kpiCard_green}`}>
          <div className={s.kpiLabel}>Cash Received</div>
          <div className={s.kpiValue}>{formatCurrency(cashReceived)}</div>
          <div className={s.kpiSub}>{grossRevenue !== cashReceived ? `₦${(grossRevenue - cashReceived).toLocaleString()} uncollected` : 'From egg sales'}</div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiLabel}>Total Expenses</div>
          <div className={s.kpiValue}>{formatCurrency(totalExpenses)}</div>
          <div className={s.kpiSub}>All categories</div>
        </div>
        <div className={`${s.kpiCard} ${netProfit >= 0 ? s.kpiCard_green : s.kpiCard_red}`}>
          <div className={s.kpiLabel}>Net P/L</div>
          <div className={s.kpiValue}>{formatCurrency(netProfit)}</div>
          <div className={s.kpiSub}>{netProfit >= 0 ? 'Profit' : 'Loss'}</div>
        </div>
      </div>

      {flocks.length > 0 && (
        <div>
          <div className={s.sectionTitle}>Active Flocks</div>
          <div
            className={s.summaryBar}
            style={{ gridTemplateColumns: `repeat(${Math.min(flocks.length, 4)}, 1fr)` }}
          >
            {flocks.map(flock => {
              const birds = getBirdCount(flock.id, flock.initial_bird_count)
              const currentAgeWeeks = (flock.age_weeks_at_acquisition != null && flock.date_acquired)
                ? flock.age_weeks_at_acquisition + Math.floor(dayjs().diff(dayjs(flock.date_acquired), 'day') / 7)
                : null
              return (
                <div
                  key={flock.id}
                  className={s.kpiCard}
                  style={{ borderLeft: `4px solid ${flock.color || '#2563eb'}` }}
                >
                  <div className={s.kpiLabel}>{flock.name}</div>
                  <div className={s.kpiValue}>{birds.toLocaleString()}</div>
                  <div className={s.kpiSub}>
                    birds remaining
                    {currentAgeWeeks != null && (
                      <span style={{ marginLeft: 8, fontWeight: 600, color: '#374151' }}>· {currentAgeWeeks} wks old</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {chartData.length > 0 && (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '20px' }}>
          <div className={s.sectionTitle}>
            Daily Production — {dayjs(monthYear + '-01').format('MMMM YYYY')}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip
                formatter={(val) => [val.toLocaleString(), 'Eggs']}
                contentStyle={{ fontSize: 13, borderRadius: 8 }}
              />
              <Bar dataKey="total_eggs" fill="#2563eb" radius={[3, 3, 0, 0]} name="Eggs" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
