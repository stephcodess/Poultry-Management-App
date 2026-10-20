import React, { useEffect, useState } from 'react'
import { useMonth } from '../utils/MonthContext'
import { formatCurrency, formatEggs, formatMonthYear } from '../utils/format'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  Legend
} from 'recharts'
import Recommendations, { buildRecommendations } from '../components/common/Recommendations'
import styles from './Dashboard.module.css'

const EMPTY = {
  opening: { totalEggs: 0 },
  totalProduced: 0, totalStock: 0, totalOutflow: 0,
  closingStockCrates: 0, closingStockPieces: 0,
  grossRevenue: 0, openingBalance: 0, totalCashIn: 0,
  totalExpenses: 0, closingBalance: 0,
  bestSellingSize: '—', avgCratePrice: 0,
  dailyProduction: [], salesBySize: [],
}

function KpiCard({ label, value, sub, color = '#2563eb', icon, trend }) {
  return (
    <div className={styles.kpiCard}>
      <div className={styles.kpiTop}>
        <span className={styles.kpiIcon} style={{ background: color + '18', color }}>
          {icon}
        </span>
        {trend !== undefined && (
          <span className={`${styles.kpiBadge} ${trend >= 0 ? styles.kpiBadgeUp : styles.kpiBadgeDown}`}>
            {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className={styles.kpiValue}>{value}</div>
      <div className={styles.kpiLabel}>{label}</div>
      {sub && <div className={styles.kpiSub}>{sub}</div>}
    </div>
  )
}

const PIE_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#6366f1']

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>Day {label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <strong>{p.value}</strong> eggs
        </p>
      ))}
    </div>
  )
}

const FinanceTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>Day {label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <strong>{formatCurrency(p.value)}</strong>
        </p>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { monthYear } = useMonth()
  const [summary, setSummary] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [editingBalance, setEditingBalance] = useState(false)
  const [balanceInput, setBalanceInput] = useState('')
  const [auxCounts, setAuxCounts] = useState({ health: 0, feed: 0, mortality: 0 })
  const [flocks, setFlocks] = useState([])
  const [prodRecords, setProdRecords] = useState([])

  useEffect(() => {
    setLoading(true)
    setEditingBalance(false)
    window.api.balance.autoLoad(monthYear).then(() =>
      Promise.all([
        window.api.dashboard.getSummary(monthYear),
        window.api.health.getAll(monthYear),
        window.api.feed.getAll(monthYear),
        window.api.mortality.getAll(monthYear),
        window.api.flocks.getAll(),
        window.api.production.getAll(monthYear),
      ])
    ).then(([data, health, feed, mortality, flocksData, prod]) => {
      setSummary(data || EMPTY)
      setAuxCounts({ health: health.length, feed: feed.length, mortality: mortality.length })
      setFlocks(flocksData)
      setProdRecords(prod)
      setLoading(false)
    })
  }, [monthYear])

  async function handleSaveBalance() {
    const val = parseFloat(balanceInput) || 0
    await window.api.balance.upsert({ month_year: monthYear, opening_balance: val, notes: 'Manual entry' })
    setEditingBalance(false)
    const data = await window.api.dashboard.getSummary(monthYear)
    setSummary(data || EMPTY)
  }

  const {
    opening, totalProduced, totalStock, closingStockCrates, closingStockPieces,
    grossRevenue, cashReceived, openingBalance, totalCashIn, totalExpenses, closingBalance,
    bestSellingSize, avgCratePrice, dailyProduction, totalOutflow,
  } = summary

  const effectiveCashReceived = cashReceived ?? grossRevenue
  const effectiveTotalCashIn = totalCashIn ?? (openingBalance + grossRevenue)

  const chartData = (dailyProduction || []).map(d => ({
    date: d.date.slice(8),
    'Old Layers': d.l1,
    'New Layers': d.l2,
    Total: d.total,
  }))

  const profitData = (dailyProduction || []).map((d, i) => ({
    date: d.date.slice(8),
    Revenue: Math.round((grossRevenue / Math.max(dailyProduction.length, 1))),
    Expenses: Math.round((totalExpenses / Math.max(dailyProduction.length, 1))),
  }))

  const pieData = [
    { name: 'Eggs Sold', value: totalOutflow },
    { name: 'Closing Stock', value: closingStockCrates * 30 + closingStockPieces },
    { name: 'Opening Stock', value: opening.totalEggs },
  ].filter(d => d.value > 0)

  const profitMargin = effectiveCashReceived > 0
    ? Math.round(((effectiveCashReceived - totalExpenses) / effectiveCashReceived) * 100)
    : 0

  const stockUsedPct = totalStock > 0
    ? Math.round((totalOutflow / totalStock) * 100)
    : 0

  const recommendations = buildRecommendations({
    summary,
    healthCount: auxCounts.health,
    feedCount: auxCounts.feed,
    mortalityCount: auxCounts.mortality,
    monthYear,
    flocks,
    prodRecords,
  })

  return (
    <div className={styles.page}>
      {/* Smart Recommendations */}
      {!loading && <Recommendations recommendations={recommendations} />}

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
              {formatCurrency(effectiveCashReceived)} cash received
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
          <div className={styles.heroStatDivider} />
          <div className={styles.heroStat}>
            <span className={styles.heroStatValue}>{bestSellingSize}</span>
            <span className={styles.heroStatLabel}>Best Size</span>
          </div>
        </div>
      </div>

      {/* KPI Row 1 — Eggs */}
      <div className={styles.sectionLabel}>Egg Inventory</div>
      <div className={styles.kpiGrid}>
        <KpiCard
          label="Opening Stock"
          value={formatEggs(opening.totalEggs)}
          sub="Carried forward"
          color="#6366f1"
          icon="📦"
        />
        <KpiCard
          label="Monthly Production"
          value={formatEggs(totalProduced)}
          sub="This month"
          color="#2563eb"
          icon="🥚"
        />
        <KpiCard
          label="Total Outflow"
          value={formatEggs(totalOutflow)}
          sub="Sold + domestic"
          color="#f59e0b"
          icon="📤"
        />
        <KpiCard
          label="Closing Stock"
          value={`${closingStockCrates} crates`}
          sub={`+ ${closingStockPieces} loose pieces`}
          color="#16a34a"
          icon="✅"
        />
      </div>

      {/* KPI Row 2 — Finance */}
      <div className={styles.sectionLabel}>Financial Performance</div>
      <div className={styles.kpiGrid}>
        <KpiCard
          label="Cash Received"
          value={formatCurrency(effectiveCashReceived)}
          sub={grossRevenue !== effectiveCashReceived ? `${formatCurrency(grossRevenue - effectiveCashReceived)} uncollected` : 'All sales collected'}
          color="#16a34a"
          icon="💰"
        />
        <KpiCard
          label="Total Expenses"
          value={formatCurrency(totalExpenses)}
          sub="Operating costs"
          color="#dc2626"
          icon="💸"
        />
        <KpiCard
          label="Net Profit"
          value={formatCurrency(effectiveCashReceived - totalExpenses)}
          sub={`${profitMargin}% margin`}
          color={effectiveCashReceived - totalExpenses >= 0 ? '#16a34a' : '#dc2626'}
          icon="📊"
        />
        <KpiCard
          label="Avg Crate Price"
          value={formatCurrency(avgCratePrice)}
          sub="Across all sizes"
          color="#6366f1"
          icon="🏷"
        />
      </div>

      {/* Charts Row */}
      <div className={styles.chartsGrid}>
        {/* Daily Production */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <div>
              <div className={styles.chartTitle}>Daily Production</div>
              <div className={styles.chartSub}>Eggs per day by flock</div>
            </div>
            <div className={styles.chartLegend}>
              <span><span className={styles.dot} style={{ background: '#2563eb' }} />Old Layers</span>
              <span><span className={styles.dot} style={{ background: '#16a34a' }} />New Layers</span>
            </div>
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="l1Grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="l2Grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16a34a" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="Old Layers" stroke="#2563eb" strokeWidth={2} fill="url(#l1Grad)" dot={false} />
                <Area type="monotone" dataKey="New Layers" stroke="#16a34a" strokeWidth={2} fill="url(#l2Grad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.chartEmpty}>No production data this month</div>
          )}
        </div>

        {/* Revenue vs Expenses Bar */}
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
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="45%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />
                  ))}
                </Pie>
                <Tooltip formatter={v => [`${v} eggs`, '']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.chartEmpty}>No egg data this month</div>
          )}
        </div>

        {/* Financial Summary Card */}
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
                    style={{ width: 110, fontSize: 13, padding: '2px 6px', border: '1px solid #d1d5db', borderRadius: 6 }}
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveBalance(); if (e.key === 'Escape') setEditingBalance(false) }}
                  />
                  <button onClick={handleSaveBalance} style={{ fontSize: 12, padding: '2px 8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer' }}>✓</button>
                  <button onClick={() => setEditingBalance(false)} style={{ fontSize: 12, padding: '2px 6px', background: '#f3f4f6', border: 'none', borderRadius: 5, cursor: 'pointer' }}>✕</button>
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
              <span className={styles.summaryValue} style={{ color: '#16a34a' }}>
                {formatCurrency(effectiveCashReceived)}
              </span>
            </div>
            {grossRevenue !== effectiveCashReceived && (
              <div className={styles.summaryRow} style={{ opacity: 0.6, fontSize: '13px' }}>
                <span className={styles.summaryLabel}>  (Gross Revenue: {formatCurrency(grossRevenue)})</span>
                <span className={styles.summaryValue} style={{ color: '#d97706' }}>
                  {formatCurrency(grossRevenue - effectiveCashReceived)} uncollected
                </span>
              </div>
            )}
            <div className={styles.summaryDivider} />
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Total Cash In</span>
              <span className={styles.summaryValue}>{formatCurrency(effectiveTotalCashIn)}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>− Operating Expenses</span>
              <span className={styles.summaryValue} style={{ color: '#dc2626' }}>
                {formatCurrency(totalExpenses)}
              </span>
            </div>
            <div className={styles.summaryDivider} />
            <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
              <span>Closing Balance</span>
              <span style={{ color: closingBalance >= 0 ? '#16a34a' : '#dc2626' }}>
                {formatCurrency(closingBalance)}
              </span>
            </div>
          </div>

          {/* Progress bars */}
          <div className={styles.progressSection}>
            <div className={styles.progressLabel}>
              <span>Stock Utilised</span>
              <span>{stockUsedPct}%</span>
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
