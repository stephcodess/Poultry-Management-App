import React, { useState, useEffect } from 'react'
import Modal from './Modal'
import Button from './Button'
import styles from './ReportPreviewModal.module.css'
import { formatCurrency, formatEggs, formatMonthYear, formatDate } from '../../utils/format'
import { calcPricingInsights } from '../../utils/pricingInsights'

export default function ReportPreviewModal({ monthYear, onClose, onExportPdf, exporting }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [summary, production, sales, domestic, expenses, health, feed, mortality, flocks, feedStock] = await Promise.all([
        window.api.dashboard.getSummary(monthYear),
        window.api.production.getAll(monthYear),
        window.api.sales.getAll(monthYear),
        window.api.domestic.getAll(monthYear),
        window.api.expenses.getAll(monthYear),
        window.api.health.getAll(monthYear),
        window.api.feed.getAll(monthYear),
        window.api.mortality.getAll(monthYear),
        window.api.flocks.getAll(),
        window.api.feed.getStock(),
      ])
      setData({ summary, production, sales, domestic, expenses, health, feed, mortality, flocks, feedStock })
      setLoading(false)
    }
    load()
  }, [monthYear])

  const footer = (
    <>
      <Button variant="secondary" onClick={onClose}>Close</Button>
      <Button variant="primary" onClick={onExportPdf} disabled={exporting || loading}>
        {exporting ? 'Exporting…' : '⬇ Download PDF'}
      </Button>
    </>
  )

  return (
    <Modal title={`Report Preview — ${formatMonthYear(monthYear)}`} onClose={onClose} footer={footer} maxWidth="900px" blurred>
      {loading ? (
        <div className={styles.loading}>
          <div className={styles.loadingSpinner} />
          <span>Loading report data…</span>
        </div>
      ) : (
        <div className={styles.preview}>
          <PreviewSection data={data} monthYear={monthYear} />
        </div>
      )}
    </Modal>
  )
}

function PreviewSection({ data, monthYear }) {
  const { summary, production, sales, domestic, expenses, health, feed, mortality, flocks, feedStock } = data

  const netProfit = summary.grossRevenue - summary.totalExpenses
  const profitMargin = summary.grossRevenue > 0
    ? ((netProfit / summary.grossRevenue) * 100).toFixed(1) : '0.0'

  const totalFeedKg    = feed.reduce((s, r) => s + (r.quantity_kg || 0), 0)
  const totalMortality = mortality.reduce((s, r) => s + (r.count || 0), 0)
  const totalDomEggs   = domestic.reduce((s, r) => s + ((r.crates || 0) * 30) + (r.pieces || 0), 0)
  const totalCratesSold = sales.reduce((s, r) => s + (r.crates || 0), 0)
  const totalHealthCost = health.reduce((s, r) => s + (r.cost || 0), 0)
  const totalRecords   = production.length + sales.length + domestic.length + expenses.length + feed.length + health.length + mortality.length

  const expByCat = {}
  expenses.forEach(r => { expByCat[r.category] = (expByCat[r.category] || 0) + r.amount })
  const sortedCats = Object.entries(expByCat).sort(([, a], [, b]) => b - a)

  // Birds remaining per flock: initial_bird_count minus all-time mortality for that flock
  const mortalityByFlock = {}
  mortality.forEach(r => {
    if (r.flock_id) mortalityByFlock[r.flock_id] = (mortalityByFlock[r.flock_id] || 0) + (r.count || 0)
  })
  const flockStatus = flocks.map(f => ({
    ...f,
    removed: mortalityByFlock[f.id] || 0,
    remaining: Math.max((f.initial_bird_count || 0) - (mortalityByFlock[f.id] || 0), 0),
  }))
  const totalBirds = flockStatus.reduce((s, f) => s + f.remaining, 0)
  const totalInitial = flockStatus.reduce((s, f) => s + (f.initial_bird_count || 0), 0)

  // Health alerts: upcoming due dates
  const upcomingHealth = health.filter(r => r.next_due_date).slice(0, 3)

  const profitStatus = netProfit >= 0 ? 'profit' : 'loss'

  return (
    <>
      {/* ── AT-A-GLANCE SUMMARY ── */}
      <div className={styles.summaryBlock}>
        <div className={styles.summaryHeader}>
          <span className={styles.summaryIcon}>🐔</span>
          <div>
            <div className={styles.summaryTitle}>Farm Status at a Glance</div>
            <div className={styles.summarySub}>{formatMonthYear(monthYear)} · {totalRecords} records</div>
          </div>
          <div className={`${styles.statusBadge} ${styles['status_' + profitStatus]}`}>
            {netProfit >= 0 ? '✅ Profitable' : '⚠️ Loss'}
          </div>
        </div>

        <div className={styles.summaryGrid}>
          {/* Flock birds */}
          <div className={styles.summaryCard}>
            <div className={styles.summaryCardIcon}>🐓</div>
            <div className={styles.summaryCardBody}>
              <div className={styles.summaryCardValue}>{totalBirds.toLocaleString()}</div>
              <div className={styles.summaryCardLabel}>Birds Alive</div>
              <div className={styles.summaryCardSub}>{totalMortality > 0 ? `${totalMortality} removed this month` : 'No removals this month'}</div>
            </div>
          </div>

          {/* Egg stock */}
          <div className={styles.summaryCard}>
            <div className={styles.summaryCardIcon}>🥚</div>
            <div className={styles.summaryCardBody}>
              <div className={styles.summaryCardValue}>{summary.closingStockCrates}c {summary.closingStockPieces}p</div>
              <div className={styles.summaryCardLabel}>Closing Stock</div>
              <div className={styles.summaryCardSub}>{formatEggs(summary.totalProduced)} produced</div>
            </div>
          </div>

          {/* Revenue */}
          <div className={`${styles.summaryCard} ${styles.summaryCard_green}`}>
            <div className={styles.summaryCardIcon}>💰</div>
            <div className={styles.summaryCardBody}>
              <div className={`${styles.summaryCardValue} ${styles.green}`}>{formatCurrency(summary.grossRevenue)}</div>
              <div className={styles.summaryCardLabel}>Revenue</div>
              <div className={styles.summaryCardSub}>{totalCratesSold} crates sold</div>
            </div>
          </div>

          {/* Net P/L */}
          <div className={`${styles.summaryCard} ${netProfit >= 0 ? styles.summaryCard_green : styles.summaryCard_red}`}>
            <div className={styles.summaryCardIcon}>{netProfit >= 0 ? '📈' : '📉'}</div>
            <div className={styles.summaryCardBody}>
              <div className={`${styles.summaryCardValue} ${netProfit >= 0 ? styles.green : styles.red}`}>{formatCurrency(netProfit)}</div>
              <div className={styles.summaryCardLabel}>Net {netProfit >= 0 ? 'Profit' : 'Loss'}</div>
              <div className={styles.summaryCardSub}>{profitMargin}% margin</div>
            </div>
          </div>
        </div>

        {/* Flock breakdown */}
        {flockStatus.length > 0 && (
          <div className={styles.flockRow}>
            {flockStatus.map(f => (
              <div key={f.id} className={styles.flockChip}>
                <span className={styles.flockDot} style={{ background: f.color }} />
                <span className={styles.flockChipName}>{f.name}</span>
                <span className={styles.flockChipCount}>{f.remaining.toLocaleString()} birds</span>
                {f.removed > 0 && <span className={styles.flockChipRemoved}>−{f.removed}</span>}
              </div>
            ))}
            {totalInitial > 0 && (
              <div className={styles.flockChip}>
                <span className={styles.flockChipName} style={{ color: '#64748b' }}>Survival rate</span>
                <span className={styles.flockChipCount} style={{ color: '#16a34a' }}>
                  {((totalBirds / totalInitial) * 100).toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        )}

        {/* Quick alerts */}
        <div className={styles.alertRow}>
          {totalMortality > 0 && (
            <div className={`${styles.alertChip} ${styles.alertChip_red}`}>⚠ {totalMortality} birds removed this month</div>
          )}
          {health.length > 0 && (
            <div className={`${styles.alertChip} ${styles.alertChip_purple}`}>💉 {health.length} health events · {formatCurrency(totalHealthCost)}</div>
          )}
          {totalFeedKg > 0 && (
            <div className={`${styles.alertChip} ${styles.alertChip_amber}`}>🌾 {totalFeedKg.toFixed(1)}kg feed consumed this month</div>
          )}
          {feedStock && feedStock.stockOnHandKg > 0 && (
            <div className={`${styles.alertChip} ${styles.alertChip_purple}`}>
              🏪 {feedStock.stockOnHandKg.toFixed(1)}kg feed on hand
            </div>
          )}
          {netProfit < 0 && (
            <div className={`${styles.alertChip} ${styles.alertChip_red}`}>📉 Expenses exceed revenue by {formatCurrency(Math.abs(netProfit))}</div>
          )}
        </div>
      </div>

      {/* ── HERO KPIs ── */}
      <div className={styles.kpiGrid}>
        <KpiCard label="Total Production" value={formatEggs(summary.totalProduced)} color="blue" />
        <KpiCard label="Gross Revenue" value={formatCurrency(summary.grossRevenue)} color="green" />
        <KpiCard label="Total Expenses" value={formatCurrency(summary.totalExpenses)} color="red" />
        <KpiCard label="Net Profit / Loss" value={formatCurrency(netProfit)} sub={`${profitMargin}% margin`} color={netProfit >= 0 ? 'green' : 'red'} />
      </div>

      {/* ── DETAIL SECTIONS ── */}
      <SectionBlock icon="🥚" title="Production" count={production.length} unit="entries">
        <StatRow label="Opening Stock" value={formatEggs(summary.opening?.totalEggs || 0)} />
        <StatRow label="Produced This Month" value={formatEggs(summary.totalProduced)} />
        <StatRow label="Closing Stock" value={`${summary.closingStockCrates}c ${summary.closingStockPieces}p`} />
        <RecordTable
          headers={['Date', 'Flock', 'Total Eggs', 'Yield %']}
          rows={production.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(r => [
            formatDate(r.date), r.flock_name || r.layer_type || '—',
            formatEggs(r.total_eggs), r.daily_yield_pct ? `${r.daily_yield_pct}%` : '—',
          ])}
        />
      </SectionBlock>

      <SectionBlock icon="💰" title="Sales" count={sales.length} unit="transactions">
        <StatRow label="Gross Revenue" value={formatCurrency(summary.grossRevenue)} highlight="green" />
        <StatRow label="Crates Sold" value={`${totalCratesSold} crates`} />
        <StatRow label="Avg Price / Crate" value={formatCurrency(summary.avgCratePrice)} />
        <StatRow label="Best Selling Size" value={summary.bestSellingSize || '—'} />
        <RecordTable
          headers={['Date', 'Size', 'Crates', 'Revenue', 'Buyer']}
          rows={sales.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(r => [
            formatDate(r.date), r.egg_size, `${r.crates}c`, formatCurrency(r.total_revenue), r.buyer_name || '—',
          ])}
        />
      </SectionBlock>

      <SectionBlock icon="🏠" title="Domestic Usage" count={domestic.length} unit="entries">
        <StatRow label="Total Eggs Used" value={formatEggs(totalDomEggs)} />
        <RecordTable
          headers={['Date', 'Location', 'Quantity']}
          rows={domestic.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(r => [
            formatDate(r.date), r.location || '—', `${r.crates}c ${r.pieces || 0}p`,
          ])}
        />
      </SectionBlock>

      <SectionBlock icon="📋" title="Expenses" count={expenses.length} unit="transactions">
        <StatRow label="Total Expenses" value={formatCurrency(summary.totalExpenses)} highlight="red" />
        <StatRow label="Categories" value={sortedCats.length.toString()} />
        {sortedCats.length > 0 && (
          <div className={styles.catList}>
            {sortedCats.map(([cat, amt]) => (
              <div key={cat} className={styles.catRow}>
                <span className={styles.catName}>{cat}</span>
                <span className={styles.catAmt}>{formatCurrency(amt)}</span>
              </div>
            ))}
          </div>
        )}
        <RecordTable
          headers={['Date', 'Category', 'Description', 'Amount']}
          rows={expenses.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(r => [
            formatDate(r.date), r.category, r.description || '—', formatCurrency(r.amount),
          ])}
        />
      </SectionBlock>

      <SectionBlock icon="🌾" title="Feed Log" count={feed.length} unit="entries">
        <StatRow label="Total Feed Used This Month" value={`${totalFeedKg} kg`} />
        {feedStock && (
          <>
            <StatRow label="Feed Stock on Hand" value={`${(feedStock.stockOnHandKg || 0).toFixed(1)} kg`} highlight={feedStock.stockOnHandKg > 0 ? 'green' : undefined} />
            <StatRow label="Total Purchased All-time" value={`${(feedStock.totalPurchasedKg || 0).toFixed(1)} kg`} />
            <StatRow label="Total Consumed All-time" value={`${(feedStock.totalConsumedKg || 0).toFixed(1)} kg`} />
          </>
        )}
        <RecordTable
          headers={['Date', 'Flock', 'Feed Type', 'Used (kg)']}
          rows={feed.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(r => [
            formatDate(r.date), r.flock_name || 'All Flocks', r.feed_type, `${r.quantity_kg} kg`,
          ])}
        />
      </SectionBlock>

      <SectionBlock icon="📉" title="Flock Movements" count={mortality.length} unit="events">
        <StatRow label="Total Removed" value={`${totalMortality} birds`} highlight={totalMortality > 0 ? 'red' : ''} />
        <RecordTable
          headers={['Date', 'Flock', 'Reason', 'Count']}
          rows={mortality.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(r => [
            formatDate(r.date), r.flock_name || '—', r.reason, r.count,
          ])}
        />
      </SectionBlock>

      <SectionBlock icon="💉" title="Health Records" count={health.length} unit="events">
        <StatRow label="Total Health Cost" value={formatCurrency(totalHealthCost)} />
        <RecordTable
          headers={['Date', 'Type', 'Name', 'Cost']}
          rows={health.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(r => [
            formatDate(r.date), r.record_type, r.name, r.cost ? formatCurrency(r.cost) : '—',
          ])}
        />
      </SectionBlock>

      {/* Pricing Insights */}
      <PricingInsightsBlock
        totalExpenses={summary.totalExpenses}
        grossRevenue={summary.grossRevenue}
        cratesSold={totalCratesSold}
        projectedCrates={totalCratesSold}
      />

      {/* Financial Summary */}
      <div className={styles.finSummary}>
        <div className={styles.finTitle}>📊 Financial Summary</div>
        <div className={styles.finGrid}>
          <div className={styles.finBox}>
            <div className={styles.finBoxTitle}>Cash Flow</div>
            <StatRow label="Opening Balance" value={formatCurrency(summary.openingBalance)} />
            <StatRow label="+ Gross Revenue" value={formatCurrency(summary.grossRevenue)} highlight="green" />
            <StatRow label="− Expenses" value={formatCurrency(summary.totalExpenses)} highlight="red" />
            <div className={styles.finTotal}>
              <span>Closing Balance</span>
              <span className={summary.closingBalance >= 0 ? styles.green : styles.red}>{formatCurrency(summary.closingBalance)}</span>
            </div>
          </div>
          <div className={styles.finBox}>
            <div className={styles.finBoxTitle}>Profit & Loss</div>
            <StatRow label="Gross Revenue" value={formatCurrency(summary.grossRevenue)} highlight="green" />
            <StatRow label="Total Expenses" value={formatCurrency(summary.totalExpenses)} highlight="red" />
            <div className={styles.finTotal}>
              <span>{netProfit >= 0 ? 'Net Profit' : 'Net Loss'}</span>
              <span className={netProfit >= 0 ? styles.green : styles.red}>{formatCurrency(netProfit)}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function SectionBlock({ icon, title, count, unit, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={styles.section}>
      <button className={styles.sectionHead} onClick={() => setOpen(o => !o)}>
        <span>{icon} {title}</span>
        <span className={styles.sectionMeta}>
          <span className={styles.sectionCount}>{count} {unit}</span>
          <span className={styles.chevron}>{open ? '▲' : '▼'}</span>
        </span>
      </button>
      {open && <div className={styles.sectionBody}>{children}</div>}
    </div>
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

function StatRow({ label, value, highlight }) {
  return (
    <div className={styles.statRow}>
      <span className={styles.statLabel}>{label}</span>
      <span className={`${styles.statValue} ${highlight ? styles['highlight_' + highlight] : ''}`}>{value}</span>
    </div>
  )
}

function RecordTable({ headers, rows }) {
  if (!rows.length) return <div className={styles.emptyTable}>No records</div>
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

function PricingInsightsBlock({ totalExpenses, grossRevenue, cratesSold, projectedCrates }) {
  const p = calcPricingInsights({ totalExpenses, grossRevenue, cratesSold, projectedCrates })
  const isProfitable = p.surplusPerCrate >= 0

  return (
    <div className={styles.pricingBlock}>
      <div className={styles.pricingTitle}>💡 Pricing Intelligence — Next Month Targets</div>

      {/* Current month snapshot */}
      <div className={styles.pricingSnap}>
        <div className={styles.snapItem}>
          <div className={styles.snapLabel}>Actual Avg Price/Crate</div>
          <div className={styles.snapValue}>{p.hasSales ? formatCurrency(p.actualAvgPrice) : '—'}</div>
        </div>
        <div className={styles.snapItem}>
          <div className={styles.snapLabel}>Break-Even Price/Crate</div>
          <div className={styles.snapValue}>{p.hasSales ? formatCurrency(p.breakEvenPrice) : '—'}</div>
        </div>
        <div className={styles.snapItem}>
          <div className={styles.snapLabel}>Surplus / Deficit per Crate</div>
          <div className={`${styles.snapValue} ${isProfitable ? styles.pGreen : styles.pRed}`}>
            {p.hasSales ? (isProfitable ? '+' : '') + formatCurrency(p.surplusPerCrate) : '—'}
          </div>
        </div>
        <div className={styles.snapItem}>
          <div className={styles.snapLabel}>Cost Ratio</div>
          <div className={`${styles.snapValue} ${p.costRatio > 100 ? styles.pRed : p.costRatio > 80 ? styles.pAmber : styles.pGreen}`}>
            {p.hasSales ? `${p.costRatio.toFixed(1)}%` : '—'}
          </div>
        </div>
      </div>

      {/* Status message */}
      {p.hasSales && (
        <div className={`${styles.pricingStatus} ${isProfitable ? styles.pricingStatus_ok : styles.pricingStatus_warn}`}>
          {isProfitable
            ? `✅ You earned ${formatCurrency(p.surplusPerCrate)} above cost per crate. Keep pricing at or above ${formatCurrency(p.breakEvenPrice)} to stay profitable.`
            : `⚠️ You lost ${formatCurrency(Math.abs(p.surplusPerCrate))} per crate. You need to sell at least ${formatCurrency(p.breakEvenPrice)} per crate to break even.`
          }
        </div>
      )}

      {/* Target pricing table */}
      {p.targets.length > 0 && (
        <>
          <div className={styles.pricingSubTitle}>
            Target prices for next month — based on {p.cratesSold} projected crates &amp; {formatCurrency(p.totalExpenses)} expenses
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

      {/* Min crates advisory */}
      {p.minCratesAtCurrentPrice !== null && (
        <div className={styles.pricingAdvisory}>
          📦 At your current avg price of <strong>{formatCurrency(p.actualAvgPrice)}/crate</strong>, you must sell at least <strong>{p.minCratesAtCurrentPrice} crates</strong> next month to cover all expenses.
          {p.cratesSold < p.minCratesAtCurrentPrice && (
            <span className={styles.pRed}> This month you sold {p.cratesSold} — <strong>{p.minCratesAtCurrentPrice - p.cratesSold} more crates needed</strong>.</span>
          )}
        </div>
      )}
    </div>
  )
}
