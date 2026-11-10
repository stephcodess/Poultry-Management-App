import React, { useEffect, useState, useCallback } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { supabase } from '../supabaseClient'
import { useMonth } from '../utils/MonthContext'
import { formatCurrency, formatEggs, formatMonthYear } from '../utils/format'
import dayjs from 'dayjs'
import styles from './Dashboard.module.css'

const PIE_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#6366f1']

function KpiCard({ label, value, sub, color = '#2563eb', icon }) {
  return (
    <div className={styles.kpiCard}>
      <div className={styles.kpiTop}>
        <span className={styles.kpiIcon} style={{ background: color + '18', color }}>{icon}</span>
      </div>
      <div className={styles.kpiValue}>{value}</div>
      <div className={styles.kpiLabel}>{label}</div>
      {sub && <div className={styles.kpiSub}>{sub}</div>}
    </div>
  )
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>Day {label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: <strong>{p.value}</strong> eggs</p>
      ))}
    </div>
  )
}

function FinanceTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>Day {label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: <strong>{formatCurrency(p.value)}</strong></p>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { monthYear } = useMonth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [editingBalance, setEditingBalance] = useState(false)
  const [balanceInput, setBalanceInput] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setEditingBalance(false)
    const [prod, sal, exp, fl, mov, cs, dp, domRes, otherRes, balRes] = await Promise.all([
      supabase.from('production').select('date, crates, pieces, flock_id, daily_yield_pct').eq('month_year', monthYear),
      supabase.from('sales').select('payment_status, crates, pieces, price_per_crate').eq('month_year', monthYear),
      supabase.from('expenses').select('amount, category').eq('month_year', monthYear),
      supabase.from('flocks').select('*').neq('is_active', 0),
      supabase.from('flock_movements').select('flock_id, count'),
      supabase.from('credit_sales').select('amount_owed, amount_paid').eq('month_year', monthYear),
      supabase.from('debt_payments').select('amount').eq('month_year', monthYear),
      supabase.from('domestic_usage').select('count, crates, pieces').eq('month_year', monthYear),
      supabase.from('other_income').select('amount').eq('month_year', monthYear),
      supabase.from('monthly_balance').select('opening_balance').eq('month_year', monthYear).maybeSingle(),
    ])
    // Also fetch previous month closing as opening stock
    const prevMonth = dayjs(monthYear + '-01').subtract(1, 'month').format('YYYY-MM')
    const [prevProd, prevDom] = await Promise.all([
      supabase.from('production').select('crates, pieces').eq('month_year', prevMonth),
      supabase.from('domestic_usage').select('count, crates, pieces').eq('month_year', prevMonth),
    ])
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
      openingBalance: balRes.data?.opening_balance || 0,
      prevProduction: prevProd.data || [],
      prevDomestic: prevDom.data || [],
      allOutstandingCs: allCsRes.data || [],
    })
    setLoading(false)
  }, [monthYear])

  useEffect(() => { load() }, [load])

  async function handleSaveBalance() {
    const val = parseFloat(balanceInput) || 0
    await supabase.from('monthly_balance').upsert({ month_year: monthYear, opening_balance: val }, { onConflict: 'month_year' })
    setEditingBalance(false)
    load()
  }

  if (loading || !data) return (
    <div className={styles.loadingWrap}>
      <div className={styles.spinner} />
      <span>Loading dashboard…</span>
    </div>
  )

  const { production, sales, expenses, flocks, movements, creditSales, debtPayments, domesticUsage, otherIncome, openingBalance, prevProduction, prevDomestic, allOutstandingCs } = data

  // --- Egg math ---
  const prevProduced = prevProduction.reduce((s, r) => s + (r.crates || 0) * 30 + (r.pieces || 0), 0)
  const prevSoldDom = prevDomestic.reduce((s, r) => s + (r.crates != null ? r.crates * 30 + (r.pieces || 0) : (r.count || 0)), 0)
  const openingEggs = Math.max(0, prevProduced - prevSoldDom)
  const totalProduced = production.reduce((s, r) => s + (r.crates || 0) * 30 + (r.pieces || 0), 0)
  const totalStock = openingEggs + totalProduced
  const domEggs = domesticUsage.reduce((s, r) => s + (r.crates != null ? r.crates * 30 + (r.pieces || 0) : (r.count || 0)), 0)
  const salesEggs = sales.reduce((s, r) => s + ((r.crates || 0) * 30 + (r.pieces || 0)), 0)
  const totalOutflow = salesEggs + domEggs
  const closingEggs = Math.max(0, totalStock - totalOutflow)
  const closingStockCrates = Math.floor(closingEggs / 30)
  const closingStockPieces = closingEggs % 30

  // --- Revenue math ---
  const cashSalesRev = sales.filter(r => !r.payment_status || r.payment_status === 'cash')
    .reduce((s, r) => s + ((r.crates || 0) + (r.pieces || 0) / 30) * (r.price_per_crate || 0), 0)
  const creditDeposits = creditSales.reduce((s, r) => s + (r.amount_paid || 0), 0)
  const debtRepayments = debtPayments.reduce((s, r) => s + (r.amount || 0), 0)
  const creditRev = creditSales.reduce((s, r) => s + (r.amount_owed || 0), 0)
  const otherIncomeTotal = otherIncome.reduce((s, r) => s + (r.amount || 0), 0)
  const grossRevenue = cashSalesRev + creditRev + otherIncomeTotal
  const cashReceived = cashSalesRev + creditDeposits + debtRepayments + otherIncomeTotal
  const totalExpenses = expenses.reduce((s, r) => s + (r.amount || 0), 0)
  const totalCashIn = openingBalance + cashReceived
  const closingBalance = totalCashIn - totalExpenses
  const netProfit = cashReceived - totalExpenses
  const profitMargin = cashReceived > 0 ? Math.round((netProfit / cashReceived) * 100) : 0
  const stockUsedPct = totalStock > 0 ? Math.round((totalOutflow / totalStock) * 100) : 0
  const outstanding = allOutstandingCs.reduce((s, r) => s + Math.max(0, (r.amount_owed || 0) - (r.amount_paid || 0)), 0)

  // avg crate price
  const salesWithPrice = sales.filter(r => r.price_per_crate > 0)
  const avgCratePrice = salesWithPrice.length > 0
    ? salesWithPrice.reduce((s, r) => s + r.price_per_crate, 0) / salesWithPrice.length
    : 0

  // --- Chart data ---
  const dailyMap = {}
  production.forEach(r => {
    const day = r.date.slice(8)
    if (!dailyMap[day]) dailyMap[day] = { date: day, Total: 0, 'Flock 1': 0, 'Flock 2': 0 }
    dailyMap[day].Total += (r.crates || 0) * 30 + (r.pieces || 0)
    const idx = flocks.findIndex(f => f.id === r.flock_id)
    if (idx === 0) dailyMap[day]['Flock 1'] += (r.crates || 0) * 30 + (r.pieces || 0)
    if (idx === 1) dailyMap[day]['Flock 2'] += (r.crates || 0) * 30 + (r.pieces || 0)
  })
  const chartData = Object.values(dailyMap).sort((a, b) => a.date > b.date ? 1 : -1)
  const flock1Name = flocks[0]?.name || 'Flock 1'
  const flock2Name = flocks[1]?.name || 'Flock 2'

  const profitData = chartData.map(d => ({
    date: d.date,
    Revenue: chartData.length > 0 ? Math.round(grossRevenue / chartData.length) : 0,
    Expenses: chartData.length > 0 ? Math.round(totalExpenses / chartData.length) : 0,
  }))

  const pieData = [
    { name: 'Eggs Sold', value: salesEggs },
    { name: 'Closing Stock', value: closingEggs },
    { name: 'Opening Stock', value: openingEggs },
  ].filter(d => d.value > 0)

  function getLiveBirds(flockId, initialBirds) {
    return Math.max(0, (initialBirds || 0) - movements.filter(m => m.flock_id === flockId).reduce((s, m) => s + (m.count || 0), 0))
  }

  return (
    <div className={styles.page}>

      {/* Hero Banner */}
      <div className={styles.hero}>
        <div className={styles.heroLeft}>
          <div className={styles.heroTitle}>
            <span className={styles.heroIcon}>🐔</span>
            Eldesign Poultry Farm
          </div>
          <div className={styles.heroMonth}>{formatMonthYear(monthYear)} — Monthly Report</div>
          <div className={styles.heroPills}>
            <span className={styles.pill} style={{ background: '#dbeafe', color: '#1d4ed8' }}>
              {formatEggs(totalProduced)} produced
            </span>
            <span className={styles.pill} style={{ background: '#dcfce7', color: '#15803d' }}>
              {formatCurrency(cashReceived)} cash received
            </span>
            <span className={styles.pill} style={{ background: closingBalance >= 0 ? '#dcfce7' : '#fee2e2', color: closingBalance >= 0 ? '#15803d' : '#dc2626' }}>
              {formatCurrency(closingBalance)} closing balance
            </span>
          </div>
        </div>
        <div className={styles.heroRight}>
          <div className={styles.heroStat}>
            <span className={styles.heroStatValue}>{profitMargin}%</span>
            <span className={styles.heroStatLabel}>Profit Margin</span>
          </div>
          <div className={styles.heroStatDivider} />
          <div className={styles.heroStat}>
            <span className={styles.heroStatValue}>{stockUsedPct}%</span>
            <span className={styles.heroStatLabel}>Stock Utilised</span>
          </div>
          {outstanding > 0 && (
            <>
              <div className={styles.heroStatDivider} />
              <div className={styles.heroStat}>
                <span className={styles.heroStatValue} style={{ fontSize: 18 }}>{formatCurrency(outstanding)}</span>
                <span className={styles.heroStatLabel}>Outstanding</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Flock Age Strip */}
      {flocks.some(f => f.date_acquired) && (
        <div className={styles.flockAgeStrip}>
          {flocks.filter(f => f.date_acquired).map(f => {
            const live = getLiveBirds(f.id, f.initial_bird_count)
            const ageWeeks = f.age_weeks_at_acquisition != null
              ? f.age_weeks_at_acquisition + Math.floor(dayjs().diff(dayjs(f.date_acquired), 'day') / 7)
              : dayjs().diff(dayjs(f.date_acquired), 'week')
            return (
              <div key={f.id} className={styles.flockAgeChip}>
                <span className={styles.flockAgeDot} style={{ background: f.color || '#2563eb' }} />
                <span className={styles.flockAgeName}>{f.name}</span>
                <span className={styles.flockAgeValue}>{ageWeeks} wks · {live.toLocaleString()} birds</span>
              </div>
            )
          })}
        </div>
      )}

      {/* KPI Row 1 — Eggs */}
      <div className={styles.sectionLabel}>Egg Inventory</div>
      <div className={styles.kpiGrid}>
        <KpiCard label="Opening Stock" value={formatEggs(openingEggs)} sub="Carried forward" color="#6366f1" icon="📦" />
        <KpiCard label="Monthly Production" value={formatEggs(totalProduced)} sub="This month" color="#2563eb" icon="🥚" />
        <KpiCard label="Total Outflow" value={formatEggs(totalOutflow)} sub="Sold + domestic" color="#f59e0b" icon="📤" />
        <KpiCard label="Closing Stock" value={`${closingStockCrates} crates`} sub={`+ ${closingStockPieces} loose pieces`} color="#16a34a" icon="✅" />
      </div>

      {/* KPI Row 2 — Finance */}
      <div className={styles.sectionLabel}>Financial Performance</div>
      <div className={styles.kpiGrid}>
        <KpiCard
          label="Cash Received"
          value={formatCurrency(cashReceived)}
          sub={grossRevenue !== cashReceived ? `${formatCurrency(grossRevenue - cashReceived)} uncollected` : 'All sales collected'}
          color="#16a34a" icon="💰"
        />
        <KpiCard label="Total Expenses" value={formatCurrency(totalExpenses)} sub="Operating costs" color="#dc2626" icon="💸" />
        <KpiCard
          label="Net Profit"
          value={formatCurrency(netProfit)}
          sub={`${profitMargin}% margin`}
          color={netProfit >= 0 ? '#16a34a' : '#dc2626'} icon="📊"
        />
        <KpiCard label="Avg Crate Price" value={avgCratePrice > 0 ? formatCurrency(avgCratePrice) : '—'} sub="Across all sizes" color="#6366f1" icon="🏷" />
      </div>

      {/* Charts */}
      <div className={styles.chartsGrid}>

        {/* Daily Production */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <div>
              <div className={styles.chartTitle}>Daily Production</div>
              <div className={styles.chartSub}>Eggs per day by flock</div>
            </div>
            <div className={styles.chartLegend}>
              <span><span className={styles.dot} style={{ background: '#2563eb' }} />{flock1Name}</span>
              {flocks[1] && <span><span className={styles.dot} style={{ background: '#16a34a' }} />{flock2Name}</span>}
            </div>
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="f1Grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="f2Grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16a34a" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="Flock 1" name={flock1Name} stroke="#2563eb" strokeWidth={2} fill="url(#f1Grad)" dot={false} />
                {flocks[1] && <Area type="monotone" dataKey="Flock 2" name={flock2Name} stroke="#16a34a" strokeWidth={2} fill="url(#f2Grad)" dot={false} />}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.chartEmpty}>No production data this month</div>
          )}
        </div>

        {/* Revenue vs Expenses */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <div>
              <div className={styles.chartTitle}>Revenue vs Expenses</div>
              <div className={styles.chartSub}>Daily average projection</div>
            </div>
            <div className={styles.chartLegend}>
              <span><span className={styles.dot} style={{ background: '#16a34a' }} />Revenue</span>
              <span><span className={styles.dot} style={{ background: '#dc2626' }} />Expenses</span>
            </div>
          </div>
          {profitData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={profitData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip content={<FinanceTooltip />} />
                <Bar dataKey="Revenue" fill="#16a34a" radius={[3, 3, 0, 0]} maxBarSize={12} />
                <Bar dataKey="Expenses" fill="#dc2626" radius={[3, 3, 0, 0]} maxBarSize={12} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.chartEmpty}>No financial data this month</div>
          )}
        </div>

        {/* Egg Distribution Pie */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <div>
              <div className={styles.chartTitle}>Egg Distribution</div>
              <div className={styles.chartSub}>Stock allocation this month</div>
            </div>
          </div>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="45%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />)}
                </Pie>
                <Tooltip formatter={v => [`${v} eggs`, '']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.chartEmpty}>No egg data this month</div>
          )}
        </div>

        {/* Financial Summary */}
        <div className={`${styles.chartCard} ${styles.summaryCard}`}>
          <div className={styles.chartTitle}>Financial Summary</div>
          <div className={styles.summaryList}>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Opening Balance</span>
              {editingBalance ? (
                <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input
                    type="number"
                    value={balanceInput}
                    onChange={e => setBalanceInput(e.target.value)}
                    style={{ width: 110, fontSize: 13, padding: '2px 6px', border: '1px solid #d1d5db', borderRadius: 6, fontFamily: 'var(--font)' }}
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveBalance(); if (e.key === 'Escape') setEditingBalance(false) }}
                  />
                  <button onClick={handleSaveBalance} style={{ fontSize: 12, padding: '2px 8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontFamily: 'var(--font)' }}>✓</button>
                  <button onClick={() => setEditingBalance(false)} style={{ fontSize: 12, padding: '2px 6px', background: '#f3f4f6', border: 'none', borderRadius: 5, cursor: 'pointer', fontFamily: 'var(--font)' }}>✕</button>
                </span>
              ) : (
                <span
                  className={styles.summaryValue}
                  style={{ cursor: 'pointer', borderBottom: '1px dashed #d1d5db' }}
                  title="Click to edit opening balance"
                  onClick={() => { setBalanceInput(openingBalance); setEditingBalance(true) }}
                >
                  {formatCurrency(openingBalance)} ✎
                </span>
              )}
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>+ Cash Received</span>
              <span className={styles.summaryValue} style={{ color: '#16a34a' }}>{formatCurrency(cashReceived)}</span>
            </div>
            {grossRevenue !== cashReceived && (
              <div className={styles.summaryRow} style={{ opacity: 0.6, fontSize: 13 }}>
                <span className={styles.summaryLabel}>Gross Revenue: {formatCurrency(grossRevenue)}</span>
                <span className={styles.summaryValue} style={{ color: '#d97706' }}>{formatCurrency(grossRevenue - cashReceived)} uncollected</span>
              </div>
            )}
            <div className={styles.summaryDivider} />
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Total Cash In</span>
              <span className={styles.summaryValue}>{formatCurrency(totalCashIn)}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>− Operating Expenses</span>
              <span className={styles.summaryValue} style={{ color: '#dc2626' }}>{formatCurrency(totalExpenses)}</span>
            </div>
            <div className={styles.summaryDivider} />
            <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
              <span>Closing Balance</span>
              <span style={{ color: closingBalance >= 0 ? '#16a34a' : '#dc2626' }}>{formatCurrency(closingBalance)}</span>
            </div>
          </div>

          <div className={styles.progressSection}>
            <div className={styles.progressLabel}>
              <span>Stock Utilised</span><span>{stockUsedPct}%</span>
            </div>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${Math.min(stockUsedPct, 100)}%`, background: '#2563eb' }} />
            </div>
            <div className={styles.progressLabel} style={{ marginTop: 10 }}>
              <span>Profit Margin</span>
              <span style={{ color: profitMargin >= 0 ? '#16a34a' : '#dc2626' }}>{profitMargin}%</span>
            </div>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${Math.min(Math.abs(profitMargin), 100)}%`, background: profitMargin >= 0 ? '#16a34a' : '#dc2626' }} />
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
