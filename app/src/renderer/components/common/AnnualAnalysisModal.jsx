import React, { useState, useEffect, useMemo } from 'react'
import Modal from './Modal'
import Button from './Button'
import styles from './AnnualAnalysisModal.module.css'
import { formatCurrency, formatEggs, formatMonthYear } from '../../utils/format'
import { calcPricingInsights } from '../../utils/pricingInsights'
import dayjs from 'dayjs'

const MONTHS = ['01','02','03','04','05','06','07','08','09','10','11','12']
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function AnnualAnalysisModal({ onClose, onExportPdf, exporting }) {
  const currentYear = dayjs().format('YYYY')
  const [year, setYear] = useState(currentYear)
  const [availableYears, setAvailableYears] = useState([])
  const [monthlyData, setMonthlyData] = useState([])
  const [flocks, setFlocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [feedStock, setFeedStock] = useState(null)

  useEffect(() => {
    Promise.all([
      window.api.dashboard.getMonths(),
      window.api.flocks.getAll(),
      window.api.feed.getStock(),
    ]).then(([months, allFlocks, stock]) => {
      const years = [...new Set(months.map(m => m.slice(0, 4)))].sort().reverse()
      setAvailableYears(years.length ? years : [currentYear])
      if (years.length && !years.includes(year)) setYear(years[0])
      setFlocks(allFlocks)
      setFeedStock(stock)
    })
  }, [])

  useEffect(() => {
    async function loadYear() {
      setLoading(true)
      setMonthlyData([])
      const results = await Promise.all(
        MONTHS.map(async (m) => {
          const monthYear = `${year}-${m}`
          const [summary, production, sales, expenses, feed, mortality, health] = await Promise.all([
            window.api.dashboard.getSummary(monthYear),
            window.api.production.getAll(monthYear),
            window.api.sales.getAll(monthYear),
            window.api.expenses.getAll(monthYear),
            window.api.feed.getAll(monthYear),
            window.api.mortality.getAll(monthYear),
            window.api.health.getAll(monthYear),
          ])
          return { monthYear, summary, production, sales, expenses, feed, mortality, health }
        })
      )
      setMonthlyData(results)
      setLoading(false)
    }
    if (year) loadYear()
  }, [year])

  const annualStats = useMemo(() => {
    if (!monthlyData.length) return null
    const totalProduced   = monthlyData.reduce((s, d) => s + d.summary.totalProduced, 0)
    const grossRevenue    = monthlyData.reduce((s, d) => s + d.summary.grossRevenue, 0)
    const totalExpenses   = monthlyData.reduce((s, d) => s + d.summary.totalExpenses, 0)
    const netProfit       = grossRevenue - totalExpenses
    const profitMargin    = grossRevenue > 0 ? ((netProfit / grossRevenue) * 100).toFixed(1) : '0.0'
    const totalCratesSold = monthlyData.reduce((s, d) => s + d.sales.reduce((ss, r) => ss + (r.crates || 0), 0), 0)
    const totalFeedKg     = monthlyData.reduce((s, d) => s + d.feed.reduce((ss, r) => ss + (r.quantity_kg || 0), 0), 0)
    const totalFeedCost   = monthlyData.reduce((s, d) => s + d.feed.reduce((ss, r) => ss + (r.total_cost || 0), 0), 0)
    const totalMortality  = monthlyData.reduce((s, d) => s + d.mortality.reduce((ss, r) => ss + (r.count || 0), 0), 0)
    const totalHealthCost = monthlyData.reduce((s, d) => s + d.health.reduce((ss, r) => ss + (r.cost || 0), 0), 0)
    const totalExpTx      = monthlyData.reduce((s, d) => s + d.expenses.length, 0)
    const totalSalesTx    = monthlyData.reduce((s, d) => s + d.sales.length, 0)
    const activeMonths    = monthlyData.filter(d => d.summary.totalProduced > 0 || d.summary.grossRevenue > 0).length

    const expByCat = {}
    monthlyData.forEach(d => d.expenses.forEach(r => {
      expByCat[r.category] = (expByCat[r.category] || 0) + r.amount
    }))

    // Birds removed this year per flock
    const mortalityByFlock = {}
    monthlyData.forEach(d => d.mortality.forEach(r => {
      if (r.flock_id) mortalityByFlock[r.flock_id] = (mortalityByFlock[r.flock_id] || 0) + (r.count || 0)
    }))

    const flockStatus = flocks.map(f => ({
      ...f,
      removedThisYear: mortalityByFlock[f.id] || 0,
      remaining: Math.max((f.initial_bird_count || 0) - (mortalityByFlock[f.id] || 0), 0),
    }))
    const totalBirds    = flockStatus.reduce((s, f) => s + f.remaining, 0)
    const totalInitial  = flockStatus.reduce((s, f) => s + (f.initial_bird_count || 0), 0)
    const survivalRate  = totalInitial > 0 ? ((totalBirds / totalInitial) * 100).toFixed(1) : null

    const bestRevenueMonth = monthlyData.reduce((best, d) =>
      d.summary.grossRevenue > (best?.summary.grossRevenue || 0) ? d : best, null)
    const bestProfitMonth = monthlyData.reduce((best, d) => {
      const p  = d.summary.grossRevenue - d.summary.totalExpenses
      const bp = (best?.summary.grossRevenue || 0) - (best?.summary.totalExpenses || 0)
      return p > bp ? d : best
    }, null)

    // Month with highest mortality
    const worstMortalityMonth = monthlyData.reduce((worst, d) => {
      const cnt = d.mortality.reduce((s, r) => s + (r.count || 0), 0)
      const wcnt = worst ? worst.mortality.reduce((s, r) => s + (r.count || 0), 0) : 0
      return cnt > wcnt ? d : worst
    }, null)

    // Total health events
    const totalHealthEvents = monthlyData.reduce((s, d) => s + d.health.length, 0)

    return {
      totalProduced, grossRevenue, totalExpenses, netProfit, profitMargin,
      totalCratesSold, totalFeedKg, totalFeedCost, totalMortality, totalHealthCost,
      totalExpTx, totalSalesTx, activeMonths, totalHealthEvents,
      expByCat: Object.entries(expByCat).sort(([, a], [, b]) => b - a),
      bestRevenueMonth, bestProfitMonth, worstMortalityMonth,
      avgMonthlyRevenue:  activeMonths > 0 ? grossRevenue / activeMonths : 0,
      avgMonthlyExpenses: activeMonths > 0 ? totalExpenses / activeMonths : 0,
      flockStatus, totalBirds, totalInitial, survivalRate,
    }
  }, [monthlyData, flocks])

  const footer = (
    <>
      <Button variant="secondary" onClick={onClose}>Close</Button>
      <Button variant="primary" onClick={() => onExportPdf(year, monthlyData)} disabled={exporting || loading || !annualStats}>
        {exporting ? 'Exporting…' : '⬇ Download Annual PDF'}
      </Button>
    </>
  )

  return (
    <Modal title={`Full Year Analysis — ${year}`} onClose={onClose} footer={footer} maxWidth="900px" blurred>
      <div className={styles.topBar}>
        <div className={styles.yearSelectWrap}>
          <label className={styles.yearLabel}>Select Year</label>
          <select className={styles.yearSelect} value={year} onChange={e => setYear(e.target.value)}>
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {!loading && annualStats && (
          <span className={styles.activePill}>{annualStats.activeMonths} active months</span>
        )}
      </div>

      {loading ? (
        <div className={styles.loading}>
          <div className={styles.loadingSpinner} />
          <span>Loading {year} data across all months…</span>
        </div>
      ) : !annualStats ? null : (
        <div className={styles.content}>

          {/* ── AT-A-GLANCE ANNUAL SUMMARY ── */}
          <div className={styles.summaryBlock}>
            <div className={styles.summaryHeader}>
              <span className={styles.summaryIcon}>🐔</span>
              <div>
                <div className={styles.summaryTitle}>Annual Farm Status — {year}</div>
                <div className={styles.summarySub}>{annualStats.activeMonths} of 12 months with data · {annualStats.totalSalesTx + annualStats.totalExpTx} total transactions</div>
              </div>
              <div className={`${styles.statusBadge} ${annualStats.netProfit >= 0 ? styles.status_profit : styles.status_loss}`}>
                {annualStats.netProfit >= 0 ? '✅ Profitable Year' : '⚠️ Loss Year'}
              </div>
            </div>

            <div className={styles.summaryGrid}>
              <div className={styles.summaryCard}>
                <div className={styles.summaryCardIcon}>🐓</div>
                <div className={styles.summaryCardBody}>
                  <div className={styles.summaryCardValue}>{annualStats.totalBirds.toLocaleString()}</div>
                  <div className={styles.summaryCardLabel}>Birds Alive</div>
                  <div className={styles.summaryCardSub}>
                    {annualStats.survivalRate ? `${annualStats.survivalRate}% survival rate` : 'No initial count set'}
                  </div>
                </div>
              </div>

              <div className={styles.summaryCard}>
                <div className={styles.summaryCardIcon}>🥚</div>
                <div className={styles.summaryCardBody}>
                  <div className={styles.summaryCardValue}>{formatEggs(annualStats.totalProduced)}</div>
                  <div className={styles.summaryCardLabel}>Total Produced</div>
                  <div className={styles.summaryCardSub}>{annualStats.totalCratesSold} crates sold</div>
                </div>
              </div>

              <div className={`${styles.summaryCard} ${styles.summaryCard_green}`}>
                <div className={styles.summaryCardIcon}>💰</div>
                <div className={styles.summaryCardBody}>
                  <div className={`${styles.summaryCardValue} ${styles.green}`}>{formatCurrency(annualStats.grossRevenue)}</div>
                  <div className={styles.summaryCardLabel}>Annual Revenue</div>
                  <div className={styles.summaryCardSub}>Avg {formatCurrency(annualStats.avgMonthlyRevenue)}/mo</div>
                </div>
              </div>

              <div className={`${styles.summaryCard} ${annualStats.netProfit >= 0 ? styles.summaryCard_green : styles.summaryCard_red}`}>
                <div className={styles.summaryCardIcon}>{annualStats.netProfit >= 0 ? '📈' : '📉'}</div>
                <div className={styles.summaryCardBody}>
                  <div className={`${styles.summaryCardValue} ${annualStats.netProfit >= 0 ? styles.green : styles.red}`}>
                    {formatCurrency(annualStats.netProfit)}
                  </div>
                  <div className={styles.summaryCardLabel}>Net {annualStats.netProfit >= 0 ? 'Profit' : 'Loss'}</div>
                  <div className={styles.summaryCardSub}>{annualStats.profitMargin}% margin</div>
                </div>
              </div>
            </div>

            {/* Flock breakdown */}
            {annualStats.flockStatus.length > 0 && (
              <div className={styles.flockRow}>
                {annualStats.flockStatus.map(f => (
                  <div key={f.id} className={styles.flockChip}>
                    <span className={styles.flockDot} style={{ background: f.color }} />
                    <span className={styles.flockChipName}>{f.name}</span>
                    <span className={styles.flockChipCount}>{f.remaining.toLocaleString()} birds</span>
                    {f.removedThisYear > 0 && <span className={styles.flockChipRemoved}>−{f.removedThisYear} this year</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Alert chips */}
            <div className={styles.alertRow}>
              {annualStats.totalMortality > 0 && (
                <div className={`${styles.alertChip} ${styles.alertChip_red}`}>⚠ {annualStats.totalMortality} birds removed this year</div>
              )}
              {annualStats.totalHealthEvents > 0 && (
                <div className={`${styles.alertChip} ${styles.alertChip_purple}`}>💉 {annualStats.totalHealthEvents} health events · {formatCurrency(annualStats.totalHealthCost)}</div>
              )}
              {annualStats.totalFeedKg > 0 && (
                <div className={`${styles.alertChip} ${styles.alertChip_amber}`}>🌾 {annualStats.totalFeedKg}kg feed consumed this year</div>
              )}
              {feedStock && feedStock.stockOnHandKg > 0 && (
                <div className={`${styles.alertChip} ${styles.alertChip_purple}`}>
                  🏪 {feedStock.stockOnHandKg.toFixed(1)}kg feed on hand
                </div>
              )}
              {annualStats.netProfit < 0 && (
                <div className={`${styles.alertChip} ${styles.alertChip_red}`}>📉 Annual loss of {formatCurrency(Math.abs(annualStats.netProfit))}</div>
              )}
            </div>
          </div>

          {/* ── HEADLINE KPIs ── */}
          <div className={styles.kpiGrid}>
            <KpiCard label="Total Production" value={formatEggs(annualStats.totalProduced)} color="blue" />
            <KpiCard label="Annual Revenue" value={formatCurrency(annualStats.grossRevenue)} color="green" />
            <KpiCard label="Annual Expenses" value={formatCurrency(annualStats.totalExpenses)} color="red" />
            <KpiCard label="Annual Net Profit" value={formatCurrency(annualStats.netProfit)} sub={`${annualStats.profitMargin}% margin`} color={annualStats.netProfit >= 0 ? 'green' : 'red'} />
          </div>

          {/* Secondary metrics */}
          <div className={styles.metricsGrid}>
            <MetricTile label="Crates Sold"    value={annualStats.totalCratesSold.toLocaleString()} icon="📦" />
            <MetricTile label="Feed Consumed"  value={`${annualStats.totalFeedKg} kg`}              icon="🌾" />
            {feedStock && <MetricTile label="Feed on Hand" value={`${(feedStock.stockOnHandKg||0).toFixed(1)} kg`} icon="🏪" />}
            <MetricTile label="Flock Removed"  value={`${annualStats.totalMortality} birds`}         icon="📉" />
            <MetricTile label="Health Cost"    value={formatCurrency(annualStats.totalHealthCost)}   icon="💉" />
            <MetricTile label="Active Months"  value={`${annualStats.activeMonths} / 12`}            icon="📅" />
          </div>

          {/* Feed stock on hand */}
          {feedStock && feedStock.stockOnHandKg > 0 && (
            <div className={styles.card}>
              <div className={styles.cardTitle}>🏪 Feed Stock on Hand</div>
              <StatRow label="Current Feed Stock" value={`${feedStock.stockOnHandKg.toFixed(1)} kg`} highlight="green" />
              <StatRow label="Total Purchased (all-time)" value={`${(feedStock.totalPurchasedKg || 0).toFixed(1)} kg`} />
              <StatRow label="Total Consumed (all-time)" value={`${(feedStock.totalConsumedKg || 0).toFixed(1)} kg`} />
            </div>
          )}

          {/* Monthly breakdown */}
          <div className={styles.monthSection}>
            <div className={styles.sectionTitle}>📅 Month-by-Month Breakdown</div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className={styles.num}>Production</th>
                    <th className={styles.num}>Revenue</th>
                    <th className={styles.num}>Expenses</th>
                    <th className={styles.num}>Net P/L</th>
                    <th className={styles.num}>Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyData.map((d, i) => {
                    const rev = d.summary.grossRevenue
                    const exp = d.summary.totalExpenses
                    const pl  = rev - exp
                    const margin = rev > 0 ? ((pl / rev) * 100).toFixed(1) : '—'
                    const hasData = d.summary.totalProduced > 0 || rev > 0
                    return (
                      <tr key={d.monthYear} className={!hasData ? styles.noData : ''}>
                        <td className={styles.monthCell}>
                          {MONTH_LABELS[i]}
                          {!hasData && <span className={styles.noDataPill}>no data</span>}
                        </td>
                        <td className={styles.num}>{hasData ? formatEggs(d.summary.totalProduced) : '—'}</td>
                        <td className={`${styles.num} ${hasData && rev > 0 ? styles.green : ''}`}>{hasData ? formatCurrency(rev) : '—'}</td>
                        <td className={`${styles.num} ${hasData && exp > 0 ? styles.red : ''}`}>{hasData ? formatCurrency(exp) : '—'}</td>
                        <td className={`${styles.num} ${hasData ? (pl >= 0 ? styles.green : styles.red) : ''}`}>{hasData ? formatCurrency(pl) : '—'}</td>
                        <td className={`${styles.num} ${styles.muted}`}>{hasData && rev > 0 ? `${margin}%` : '—'}</td>
                      </tr>
                    )
                  })}
                  <tr className={styles.totalRow}>
                    <td className={styles.bold}>ANNUAL TOTAL</td>
                    <td className={`${styles.num} ${styles.bold}`}>{formatEggs(annualStats.totalProduced)}</td>
                    <td className={`${styles.num} ${styles.bold} ${styles.green}`}>{formatCurrency(annualStats.grossRevenue)}</td>
                    <td className={`${styles.num} ${styles.bold} ${styles.red}`}>{formatCurrency(annualStats.totalExpenses)}</td>
                    <td className={`${styles.num} ${styles.bold} ${annualStats.netProfit >= 0 ? styles.green : styles.red}`}>{formatCurrency(annualStats.netProfit)}</td>
                    <td className={`${styles.num} ${styles.bold}`}>{annualStats.profitMargin}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Averages & highlights */}
          <div className={styles.twoCol}>
            <div className={styles.card}>
              <div className={styles.cardTitle}>📊 Monthly Averages</div>
              <StatRow label="Avg Revenue / Month"  value={formatCurrency(annualStats.avgMonthlyRevenue)}  highlight="green" />
              <StatRow label="Avg Expenses / Month" value={formatCurrency(annualStats.avgMonthlyExpenses)} highlight="red" />
              <StatRow label="Avg Net Profit / Month" value={formatCurrency((annualStats.grossRevenue - annualStats.totalExpenses) / Math.max(annualStats.activeMonths, 1))} highlight={annualStats.netProfit >= 0 ? 'green' : 'red'} />
            </div>
            <div className={styles.card}>
              <div className={styles.cardTitle}>🏆 Highlights</div>
              {annualStats.bestRevenueMonth && (
                <StatRow label="Best Revenue Month" value={`${formatMonthYear(annualStats.bestRevenueMonth.monthYear)} — ${formatCurrency(annualStats.bestRevenueMonth.summary.grossRevenue)}`} />
              )}
              {annualStats.bestProfitMonth && (
                <StatRow label="Best Profit Month" value={`${formatMonthYear(annualStats.bestProfitMonth.monthYear)} — ${formatCurrency(annualStats.bestProfitMonth.summary.grossRevenue - annualStats.bestProfitMonth.summary.totalExpenses)}`} />
              )}
              <StatRow label="Total Sales Transactions" value={annualStats.totalSalesTx.toString()} />
              <StatRow label="Active Months" value={`${annualStats.activeMonths} / 12`} />
            </div>
          </div>

          {/* Pricing Insights */}
          <AnnualPricingInsights annualStats={annualStats} monthlyData={monthlyData} />

          {/* Expense breakdown */}
          {annualStats.expByCat.length > 0 && (
            <div className={styles.card}>
              <div className={styles.cardTitle}>📋 Annual Expense Breakdown by Category</div>
              {annualStats.expByCat.map(([cat, amt]) => {
                const pct = annualStats.totalExpenses > 0 ? ((amt / annualStats.totalExpenses) * 100).toFixed(1) : '0'
                return (
                  <div key={cat} className={styles.catRow}>
                    <span className={styles.catName}>{cat}</span>
                    <div className={styles.catBarWrap}><div className={styles.catBar} style={{ width: `${pct}%` }} /></div>
                    <span className={styles.catAmt}>{formatCurrency(amt)}</span>
                    <span className={styles.catPct}>{pct}%</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

function KpiCard({ label, value, sub, color }) {
  return (
    <div className={`${styles.kpiCard} ${styles['kpi_' + color] || ''}`}>
      <div className={styles.kpiLabel}>{label}</div>
      <div className={styles.kpiValue}>{value}</div>
      {sub && <div className={styles.kpiSub}>{sub}</div>}
    </div>
  )
}

function MetricTile({ label, value, icon }) {
  return (
    <div className={styles.metricTile}>
      <span className={styles.metricIcon}>{icon}</span>
      <div>
        <div className={styles.metricValue}>{value}</div>
        <div className={styles.metricLabel}>{label}</div>
      </div>
    </div>
  )
}

function StatRow({ label, value, highlight }) {
  return (
    <div className={styles.statRow}>
      <span className={styles.statLabel}>{label}</span>
      <span className={`${styles.statValue} ${highlight ? styles['highlight_' + highlight] : ''}`}>{value}</span>
    </div>
  )
}

function AnnualPricingInsights({ annualStats, monthlyData }) {
  // Projected crates = avg crates/month across active months
  const projectedCrates = annualStats.activeMonths > 0
    ? Math.round(annualStats.totalCratesSold / annualStats.activeMonths) : annualStats.totalCratesSold

  const p = calcPricingInsights({
    totalExpenses: annualStats.avgMonthlyExpenses,
    grossRevenue:  annualStats.avgMonthlyRevenue,
    cratesSold:    projectedCrates,
    projectedCrates,
  })

  const isProfitable = p.surplusPerCrate >= 0

  // Per-month pricing history
  const monthPricing = monthlyData
    .map((d, i) => {
      const crates = d.sales.reduce((s, r) => s + (r.crates || 0), 0)
      const rev    = d.summary.grossRevenue
      const exp    = d.summary.totalExpenses
      const avg    = crates > 0 ? rev / crates : 0
      const be     = crates > 0 ? exp / crates : 0
      return { month: MONTH_LABELS[i], avg, be, crates, surplus: avg - be, hasData: crates > 0 }
    })
    .filter(m => m.hasData)

  return (
    <div className={styles.pricingBlock}>
      <div className={styles.pricingTitle}>💡 Pricing Intelligence — Annual Overview &amp; Projections</div>

      <div className={styles.pricingSnap}>
        <div className={styles.snapItem}>
          <div className={styles.snapLabel}>Annual Avg Price/Crate</div>
          <div className={styles.snapValue}>{p.hasSales ? formatCurrency(annualStats.totalCratesSold > 0 ? annualStats.grossRevenue / annualStats.totalCratesSold : 0) : '—'}</div>
        </div>
        <div className={styles.snapItem}>
          <div className={styles.snapLabel}>Annual Break-Even/Crate</div>
          <div className={styles.snapValue}>{p.hasSales ? formatCurrency(annualStats.totalCratesSold > 0 ? annualStats.totalExpenses / annualStats.totalCratesSold : 0) : '—'}</div>
        </div>
        <div className={styles.snapItem}>
          <div className={styles.snapLabel}>Avg Monthly Projected Crates</div>
          <div className={styles.snapValue}>{projectedCrates} crates</div>
        </div>
        <div className={styles.snapItem}>
          <div className={styles.snapLabel}>Annual Cost Ratio</div>
          <div className={`${styles.snapValue} ${p.costRatio > 100 ? styles.pRed : p.costRatio > 80 ? styles.pAmber : styles.pGreen}`}>
            {p.hasSales ? `${(annualStats.totalExpenses / annualStats.grossRevenue * 100).toFixed(1)}%` : '—'}
          </div>
        </div>
      </div>

      {p.hasSales && (
        <div className={`${styles.pricingStatus} ${isProfitable ? styles.pricingStatus_ok : styles.pricingStatus_warn}`}>
          {isProfitable
            ? `✅ On average, each crate earned ${formatCurrency(p.surplusPerCrate)} above cost. To stay profitable next month, keep the price above ${formatCurrency(p.breakEvenPrice)}/crate.`
            : `⚠️ On average, each crate lost ${formatCurrency(Math.abs(p.surplusPerCrate))}. You need to charge at least ${formatCurrency(p.breakEvenPrice)}/crate to cover monthly costs.`
          }
        </div>
      )}

      {p.targets.length > 0 && (
        <>
          <div className={styles.pricingSubTitle}>
            Target prices for next month — based on {projectedCrates} projected crates &amp; {formatCurrency(annualStats.avgMonthlyExpenses)} avg monthly expenses
          </div>
          <div className={styles.targetGrid}>
            {p.targets.map(t => (
              <div key={t.label} className={`${styles.targetCard} ${t.margin === 0 ? styles.targetCard_neutral : styles.targetCard_profit}`}>
                <div className={styles.targetLabel}>{t.label}</div>
                <div className={styles.targetPrice}>{formatCurrency(t.price)}</div>
                <div className={styles.targetSub}>per crate</div>
              </div>
            ))}
          </div>
        </>
      )}

      {monthPricing.length > 0 && (
        <>
          <div className={styles.pricingSubTitle}>Month-by-month pricing history</div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Month</th>
                  <th className={styles.num}>Crates</th>
                  <th className={styles.num}>Avg Price</th>
                  <th className={styles.num}>Break-Even</th>
                  <th className={styles.num}>Surplus/Deficit</th>
                </tr>
              </thead>
              <tbody>
                {monthPricing.map(m => (
                  <tr key={m.month}>
                    <td>{m.month}</td>
                    <td className={styles.num}>{m.crates}</td>
                    <td className={styles.num}>{formatCurrency(m.avg)}</td>
                    <td className={styles.num}>{formatCurrency(m.be)}</td>
                    <td className={`${styles.num} ${m.surplus >= 0 ? styles.green : styles.red}`}>
                      {(m.surplus >= 0 ? '+' : '') + formatCurrency(m.surplus)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
