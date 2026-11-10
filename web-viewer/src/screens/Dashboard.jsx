import React, { useEffect, useState, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '../supabaseClient'
import { useMonth } from '../utils/MonthContext'
import { formatCurrency, formatEggs } from '../utils/format'
import { NavLink } from 'react-router-dom'
import dayjs from 'dayjs'
import s from './Screen.module.css'
import styles from './Dashboard.module.css'

export default function Dashboard() {
  const { monthYear } = useMonth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [prod, sal, exp, fl, mov, cs, dp, domRes, otherRes, healthRes, feedRes] = await Promise.all([
      supabase.from('production').select('date, crates, pieces, flock_id, no_of_birds, daily_yield_pct').eq('month_year', monthYear),
      supabase.from('sales').select('payment_status, crates, pieces, price_per_crate, egg_size').eq('month_year', monthYear),
      supabase.from('expenses').select('amount, category').eq('month_year', monthYear),
      supabase.from('flocks').select('*').eq('is_active', 1),
      supabase.from('flock_movements').select('flock_id, count'),
      supabase.from('credit_sales').select('amount_owed, amount_paid, status, month_year').eq('month_year', monthYear),
      supabase.from('debt_payments').select('amount').eq('month_year', monthYear),
      supabase.from('domestic_usage').select('count').eq('month_year', monthYear),
      supabase.from('other_income').select('amount').eq('month_year', monthYear),
      supabase.from('health_records').select('id').gte('next_due_date', dayjs().format('YYYY-MM-DD')).lte('next_due_date', dayjs().add(7, 'day').format('YYYY-MM-DD')),
      supabase.from('feed_log').select('quantity_kg').eq('month_year', monthYear),
    ])
    // outstanding debts (all time)
    const allCsRes = await supabase.from('credit_sales').select('amount_owed, amount_paid').neq('status', 'paid')
    setData({
      production: prod.data || [],
      sales: sal.data || [],
      expenses: exp.data || [],
      flocks: fl.data || [],
      movements: mov.data || [],
      creditSales: cs.data || [],
      debtPayments: dp.data || [],
      domesticUsage: domRes.data || [],
      otherIncome: otherRes.data || [],
      healthAlerts: healthRes.data || [],
      feedConsumed: feedRes.data || [],
      allOutstandingCs: allCsRes.data || [],
    })
    setLoading(false)
  }, [monthYear])

  useEffect(() => { load() }, [load])

  if (loading || !data) return (
    <div className={s.loading}>
      <div className={s.spinner} />
      <span>Loading dashboard…</span>
    </div>
  )

  const { production, sales, expenses, flocks, movements, creditSales, debtPayments, domesticUsage, otherIncome, healthAlerts, feedConsumed, allOutstandingCs } = data

  // Production metrics
  const totalEggs = production.reduce((sum, r) => sum + (r.crates || 0) * 30 + (r.pieces || 0), 0)
  const avgYield = production.length > 0
    ? (production.reduce((sum, r) => sum + (r.daily_yield_pct || 0), 0) / production.filter(r => r.daily_yield_pct != null).length || 0)
    : 0

  // Revenue
  const cashSalesRevenue = sales.filter(r => !r.payment_status || r.payment_status === 'cash')
    .reduce((s, r) => s + ((r.crates || 0) + (r.pieces || 0) / 30) * (r.price_per_crate || 0), 0)
  const creditDeposits = creditSales.reduce((s, r) => s + (r.amount_paid || 0), 0)
  const debtRepayments = debtPayments.reduce((s, r) => s + (r.amount || 0), 0)
  const creditSaleRevenue = creditSales.reduce((s, r) => s + (r.amount_owed || 0), 0)
  const otherIncomeTotal = otherIncome.reduce((s, r) => s + (r.amount || 0), 0)
  const grossRevenue = cashSalesRevenue + creditSaleRevenue + otherIncomeTotal
  const cashReceived = cashSalesRevenue + creditDeposits + debtRepayments + otherIncomeTotal

  // Expenses
  const totalExpenses = expenses.reduce((s, r) => s + (r.amount || 0), 0)
  const feedExpenses = expenses.filter(r => r.category === 'Feed').reduce((s, r) => s + (r.amount || 0), 0)

  // P&L
  const netProfit = cashReceived - totalExpenses
  const outstanding = allOutstandingCs.reduce((s, r) => s + Math.max(0, (r.amount_owed || 0) - (r.amount_paid || 0)), 0)
  const domesticTotal = domesticUsage.reduce((s, r) => s + (r.count || 0), 0)
  const feedKgConsumed = feedConsumed.reduce((s, r) => s + (r.quantity_kg || 0), 0)
  const creditSalesCount = creditSales.filter(r => r.status !== 'paid').length

  // Bird counts
  function getLiveBirds(flockId, initialBirds) {
    return Math.max(0, (initialBirds || 0) - movements.filter(m => m.flock_id === flockId).reduce((s, m) => s + (m.count || 0), 0))
  }

  // Chart data
  const chartData = Object.values(
    production.reduce((acc, r) => {
      const key = r.date
      if (!acc[key]) acc[key] = { date: dayjs(r.date).format('DD'), total_eggs: 0 }
      acc[key].total_eggs += (r.crates || 0) * 30 + (r.pieces || 0)
      return acc
    }, {})
  ).sort((a, b) => a.date > b.date ? 1 : -1)

  const yieldColor = avgYield >= 80 ? '#16a34a' : avgYield >= 60 ? '#d97706' : '#dc2626'

  return (
    <div className={styles.page}>

      {/* Financial KPIs */}
      <div className={styles.kpiGrid}>
        <div className={`${styles.kpiCard} ${styles.kpiGreen}`}>
          <div className={styles.kpiLabel}>Cash Received</div>
          <div className={styles.kpiValue}>{formatCurrency(cashReceived)}</div>
          <div className={styles.kpiSub}>This month</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Gross Revenue</div>
          <div className={styles.kpiValue}>{formatCurrency(grossRevenue)}</div>
          <div className={styles.kpiSub}>Incl. credit sales</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Total Expenses</div>
          <div className={styles.kpiValue}>{formatCurrency(totalExpenses)}</div>
          <div className={styles.kpiSub}>{expenses.length} records</div>
        </div>
        <div className={`${styles.kpiCard} ${netProfit >= 0 ? styles.kpiGreen : styles.kpiRed}`}>
          <div className={styles.kpiLabel}>Net {netProfit >= 0 ? 'Profit' : 'Loss'}</div>
          <div className={styles.kpiValue}>{formatCurrency(Math.abs(netProfit))}</div>
          <div className={styles.kpiSub}>Cash in vs. out</div>
        </div>
      </div>

      {/* Secondary KPIs */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Production</div>
          <div className={styles.kpiValue}>{formatEggs(totalEggs)}</div>
          <div className={styles.kpiSub}>{totalEggs.toLocaleString()} eggs · {production.length} records</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Avg Yield Rate</div>
          <div className={styles.kpiValue} style={{ color: yieldColor }}>{avgYield > 0 ? avgYield.toFixed(1) + '%' : '—'}</div>
          <div className={styles.kpiSub}>Daily production rate</div>
        </div>
        {outstanding > 0 && (
          <div className={`${styles.kpiCard} ${styles.kpiAmber}`}>
            <div className={styles.kpiLabel}>Outstanding Debts</div>
            <div className={styles.kpiValue}>{formatCurrency(outstanding)}</div>
            <div className={styles.kpiSub}>{creditSalesCount} unpaid {creditSalesCount === 1 ? 'sale' : 'sales'}</div>
          </div>
        )}
        {domesticTotal > 0 && (
          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>Domestic Use</div>
            <div className={styles.kpiValue}>{domesticTotal.toLocaleString()}</div>
            <div className={styles.kpiSub}>eggs this month</div>
          </div>
        )}
        {feedKgConsumed > 0 && (
          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>Feed Consumed</div>
            <div className={styles.kpiValue}>{feedKgConsumed.toLocaleString()} kg</div>
            <div className={styles.kpiSub}>{feedExpenses > 0 ? formatCurrency(feedExpenses) + ' spent' : 'this month'}</div>
          </div>
        )}
      </div>

      {/* Alerts row */}
      {(healthAlerts.length > 0) && (
        <div className={styles.alertsRow}>
          {healthAlerts.length > 0 && (
            <NavLink to="/health" className={styles.alertCard} style={{ textDecoration: 'none' }}>
              <span style={{ fontSize: 18 }}>⏰</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>Health Due Soon</div>
                <div style={{ fontSize: 12, color: '#78350f' }}>{healthAlerts.length} treatment{healthAlerts.length !== 1 ? 's' : ''} due in the next 7 days</div>
              </div>
            </NavLink>
          )}
        </div>
      )}

      {/* Active flocks */}
      {flocks.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Active Flocks</div>
          <div className={styles.flockGrid}>
            {flocks.map(flock => {
              const live = getLiveBirds(flock.id, flock.initial_birds || flock.initial_bird_count)
              const ageWeeks = (flock.age_weeks_at_acquisition != null && flock.date_acquired)
                ? flock.age_weeks_at_acquisition + Math.floor(dayjs().diff(dayjs(flock.date_acquired), 'day') / 7)
                : flock.date_acquired ? dayjs().diff(dayjs(flock.date_acquired), 'week') : null
              const retiringSoon = flock.expected_lay_end &&
                new Date(flock.expected_lay_end) <= new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
              return (
                <div key={flock.id} className={styles.flockCard} style={{ borderTopColor: flock.color || '#2563eb' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: flock.color || '#2563eb', flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text)', flex: 1 }}>{flock.name}</span>
                    {ageWeeks != null && <span style={{ fontSize: 11, background: '#eff4ff', color: '#2563eb', borderRadius: 100, padding: '1px 7px', fontWeight: 600 }}>{ageWeeks}w</span>}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#16a34a' }}>{live.toLocaleString()}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Live Birds</div>
                  {retiringSoon && <div style={{ marginTop: 6, fontSize: 11, color: '#d97706', fontWeight: 600 }}>⚠ Retiring soon</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Production chart */}
      {chartData.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Daily Production — {dayjs(monthYear + '-01').format('MMMM YYYY')}</div>
          <div style={{ padding: '0 20px 20px' }}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip formatter={(val) => [val.toLocaleString(), 'Eggs']} contentStyle={{ fontSize: 13, borderRadius: 8 }} />
                <Bar dataKey="total_eggs" fill="#2563eb" radius={[3, 3, 0, 0]} name="Eggs" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

    </div>
  )
}
