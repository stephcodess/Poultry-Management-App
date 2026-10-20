import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './Recommendations.module.css'

/**
 * Generates an array of recommendation objects from farm summary + supplementary data.
 * Each: { id, type ('warning'|'info'|'success'|'danger'), icon, title, body, action?, route? }
 */
export function buildRecommendations({ summary, healthCount, feedCount, mortalityCount, monthYear, flocks = [], prodRecords = [] }) {
  const recs = []
  if (!summary) return recs

  const {
    totalProduced, grossRevenue, totalExpenses, closingBalance,
    openingBalance, totalOutflow, closingStockCrates, closingStockPieces,
    avgCratePrice, bestSellingSize, totalStock,
  } = summary

  const netProfit      = grossRevenue - totalExpenses
  const profitMargin   = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0
  const totalCashIn    = openingBalance + grossRevenue
  const expenseRatio   = totalCashIn > 0 ? (totalExpenses / totalCashIn) * 100 : 0
  const stockUsedPct   = totalStock > 0 ? (totalOutflow / totalStock) * 100 : 0
  const closingEggs    = closingStockCrates * 30 + closingStockPieces

  // ── No production yet ──────────────────────────────────────────
  if (totalProduced === 0) {
    recs.push({
      id: 'no-production',
      type: 'info',
      icon: '🥚',
      title: 'No production logged this month',
      body: 'Start by recording your daily egg count for each flock. This powers all charts, yield %, and PDF reports.',
      action: 'Log Production',
      route: '/production',
    })
  }

  // ── No sales yet but have eggs ─────────────────────────────────
  if (grossRevenue === 0 && totalProduced > 0) {
    recs.push({
      id: 'no-sales',
      type: 'warning',
      icon: '💰',
      title: 'Eggs produced but no sales recorded',
      body: `You produced ${formatEggs(totalProduced)} this month but haven't logged any sales. Record your transactions to track revenue.`,
      action: 'Add Sales',
      route: '/sales',
    })
  }

  // ── Negative closing balance ───────────────────────────────────
  if (closingBalance < 0 && totalExpenses > 0) {
    recs.push({
      id: 'negative-balance',
      type: 'danger',
      icon: '🔴',
      title: 'Cash balance is negative',
      body: `Your wallet is ₦${Math.abs(closingBalance).toLocaleString()} in the red. Expenses (₦${totalExpenses.toLocaleString()}) exceed total cash in (₦${totalCashIn.toLocaleString()}). Consider reviewing spending.`,
      action: 'Review Expenses',
      route: '/expenses',
    })
  }

  // ── High expense ratio (>80%) ──────────────────────────────────
  if (expenseRatio > 80 && grossRevenue > 0) {
    recs.push({
      id: 'high-expense-ratio',
      type: 'warning',
      icon: '⚠️',
      title: `Expenses are ${expenseRatio.toFixed(0)}% of total cash in`,
      body: 'Your operating costs are very high relative to income. Check for categories you can reduce — especially labour, maintenance, or feed.',
      action: 'View Breakdown',
      route: '/expenses',
    })
  }

  // ── Low profit margin (<15%) ───────────────────────────────────
  if (profitMargin > 0 && profitMargin < 15 && grossRevenue > 0) {
    recs.push({
      id: 'low-margin',
      type: 'warning',
      icon: '📉',
      title: `Profit margin is low at ${profitMargin.toFixed(1)}%`,
      body: 'A healthy poultry margin is typically 20–35%. Consider increasing crate prices or reducing feed and medication costs.',
      action: 'View Sales',
      route: '/sales',
    })
  }

  // ── Good profit ────────────────────────────────────────────────
  if (profitMargin >= 25 && grossRevenue > 0) {
    recs.push({
      id: 'good-margin',
      type: 'success',
      icon: '✅',
      title: `Strong month — ${profitMargin.toFixed(1)}% profit margin`,
      body: `Net profit of ₦${netProfit.toLocaleString()} with a closing balance of ₦${closingBalance.toLocaleString()}. Consider reinvesting surplus into feed or flock expansion.`,
    })
  }

  // ── Large closing stock (>20 crates unsold) ────────────────────
  if (closingStockCrates > 20) {
    recs.push({
      id: 'high-closing-stock',
      type: 'warning',
      icon: '📦',
      title: `${closingStockCrates} crates unsold at month end`,
      body: 'High unsold stock reduces cash flow. Consider offering a slight discount on bulk orders or adding more domestic distribution channels.',
      action: 'Review Sales',
      route: '/sales',
    })
  }

  // ── Low stock utilisation (<50%) ──────────────────────────────
  if (stockUsedPct < 50 && totalProduced > 0 && grossRevenue > 0) {
    recs.push({
      id: 'low-stock-used',
      type: 'info',
      icon: '📊',
      title: `Only ${stockUsedPct.toFixed(0)}% of stock moved this month`,
      body: 'Less than half your eggs were sold or used. Review your sales channels — are buyers receiving enough notice of availability?',
      action: 'View Sales',
      route: '/sales',
    })
  }

  // ── No health records ──────────────────────────────────────────
  if (healthCount === 0 && totalProduced > 0) {
    recs.push({
      id: 'no-health',
      type: 'info',
      icon: '💉',
      title: 'No health records logged this month',
      body: 'Track vaccinations, medications, and treatments monthly. This is required for government compliance reports and helps catch disease early.',
      action: 'Add Health Record',
      route: '/health',
    })
  }

  // ── No feed records ────────────────────────────────────────────
  if (feedCount === 0 && totalProduced > 0) {
    recs.push({
      id: 'no-feed',
      type: 'info',
      icon: '🌾',
      title: 'No feed log entries this month',
      body: 'Recording feed deliveries lets you calculate feed-conversion ratio and compare feed cost against egg output.',
      action: 'Log Feed',
      route: '/feed',
    })
  }

  // ── Mortality events recorded ──────────────────────────────────
  if (mortalityCount > 5) {
    recs.push({
      id: 'high-mortality',
      type: 'danger',
      icon: '🐓',
      title: `${mortalityCount} flock removal events this month`,
      body: 'Above-average removals detected. Check if disease or environmental stress is a factor — log a health record and consult a vet if needed.',
      action: 'View Flock Movement',
      route: '/mortality',
    })
  }

  // ── Opening balance not set ────────────────────────────────────
  if (openingBalance === 0 && totalExpenses > 0) {
    recs.push({
      id: 'no-opening-balance',
      type: 'info',
      icon: '🏦',
      title: 'Opening balance is ₦0',
      body: 'Set your opening balance for this month on the Dashboard to get an accurate closing balance and cash-flow statement.',
      action: 'Set Balance',
      route: '/dashboard',
    })
  }

  // ── Flock retirement due soon (within 30 days) ─────────────────
  const today = new Date()
  const soon = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
  flocks.forEach(flock => {
    if (!flock.expected_lay_end || !flock.is_active) return
    const end = new Date(flock.expected_lay_end)
    if (end <= soon) {
      const daysLeft = Math.ceil((end - today) / (1000 * 60 * 60 * 24))
      recs.push({
        id: `retire-${flock.id}`,
        type: daysLeft <= 0 ? 'danger' : 'warning',
        icon: '🐓',
        title: daysLeft <= 0
          ? `${flock.name} is past retirement date`
          : `${flock.name} retires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
        body: daysLeft <= 0
          ? `This flock's expected laying period has ended. Consider culling or replacing them to maintain farm profitability.`
          : `Plan for the transition now — arrange a replacement flock, notify buyers of any supply gap, and log a flock movement when done.`,
        action: 'View Flock Movement',
        route: '/mortality',
      })
    }
  })

  // ── Per-flock % production below target ───────────────────────
  if (prodRecords.length > 0 && flocks.length > 0) {
    const flockMap = Object.fromEntries(flocks.map(f => [f.id, f]))
    const yieldByFlock = {}
    prodRecords.forEach(r => {
      if (!r.flock_id || r.no_of_birds <= 0) return
      if (!yieldByFlock[r.flock_id]) yieldByFlock[r.flock_id] = { total: 0, count: 0 }
      yieldByFlock[r.flock_id].total += r.daily_yield_pct
      yieldByFlock[r.flock_id].count += 1
    })
    Object.entries(yieldByFlock).forEach(([flockId, stats]) => {
      const flock = flockMap[flockId]
      if (!flock || !flock.is_active) return
      const avgYield = stats.total / stats.count
      const target = flock.target_yield_pct || 80
      if (avgYield < target * 0.85) { // >15% below target
        recs.push({
          id: `low-yield-${flockId}`,
          type: 'warning',
          icon: '📉',
          title: `${flock.name}: avg % production is ${avgYield.toFixed(1)}% (target ${target}%)`,
          body: `This flock is producing significantly below its target. Check feed quality, bird health, lighting schedule, and water availability. Log a health record if issues persist.`,
          action: 'View Health',
          route: '/health',
        })
      }
    })
  }

  return recs.slice(0, 4) // cap at 4 to avoid overwhelming
}

function formatEggs(pieces) {
  const c = Math.floor(pieces / 30)
  const p = pieces % 30
  if (c === 0) return `${p} pcs`
  if (p === 0) return `${c} crates`
  return `${c} crates, ${p} pcs`
}

const TYPE_STYLES = {
  danger:  { border: '#fecaca', bg: '#fff5f5', icon_bg: '#fee2e2', title: '#dc2626', badge: '#dc2626', badge_bg: '#fee2e2', badge_label: 'Action Needed' },
  warning: { border: '#fde68a', bg: '#fffbeb', icon_bg: '#fef3c7', title: '#d97706', badge: '#d97706', badge_bg: '#fef3c7', badge_label: 'Attention'     },
  info:    { border: '#bfdbfe', bg: '#eff6ff', icon_bg: '#dbeafe', title: '#2563eb', badge: '#2563eb', badge_bg: '#dbeafe', badge_label: 'Tip'            },
  success: { border: '#bbf7d0', bg: '#f0fdf4', icon_bg: '#dcfce7', title: '#16a34a', badge: '#16a34a', badge_bg: '#dcfce7', badge_label: 'Great job!'     },
}

function RecCard({ rec, onDismiss }) {
  const navigate = useNavigate()
  const s = TYPE_STYLES[rec.type] || TYPE_STYLES.info

  return (
    <div className={styles.card} style={{ background: s.bg, borderColor: s.border }}>
      <div className={styles.cardIcon} style={{ background: s.icon_bg }}>{rec.icon}</div>
      <div className={styles.cardBody}>
        <div className={styles.cardTop}>
          <span className={styles.cardBadge} style={{ background: s.badge_bg, color: s.badge }}>{s.badge_label}</span>
          <button className={styles.dismissBtn} onClick={() => onDismiss(rec.id)} title="Dismiss">✕</button>
        </div>
        <div className={styles.cardTitle} style={{ color: s.title }}>{rec.title}</div>
        <div className={styles.cardText}>{rec.body}</div>
        {rec.action && (
          <button
            className={styles.actionBtn}
            style={{ background: s.title, boxShadow: `0 2px 8px ${s.badge}33` }}
            onClick={() => navigate(rec.route)}
          >
            {rec.action} →
          </button>
        )}
      </div>
    </div>
  )
}

export default function Recommendations({ recommendations }) {
  const [dismissed, setDismissed] = useState([])

  const visible = recommendations.filter(r => !dismissed.includes(r.id))
  if (visible.length === 0) return null

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.headerIcon}>💡</span>
          <span className={styles.headerTitle}>Farm Insights</span>
          <span className={styles.headerCount}>{visible.length}</span>
        </div>
        <button
          className={styles.dismissAll}
          onClick={() => setDismissed(recommendations.map(r => r.id))}
        >
          Dismiss all
        </button>
      </div>
      <div className={styles.grid}>
        {visible.map(rec => (
          <RecCard key={rec.id} rec={rec} onDismiss={id => setDismissed(d => [...d, id])} />
        ))}
      </div>
    </div>
  )
}
