import { formatCurrency, formatEggs, formatDate, formatMonthYear, LAYER_LABELS } from './format'
import dayjs from 'dayjs'

function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function td(val, cls) {
  return `<td${cls ? ` class="${cls}"` : ''}>${val ?? '—'}</td>`
}

function th(val, cls) {
  return `<th${cls ? ` class="${cls}"` : ''}>${val}</th>`
}

function trow(cells) { return `<tr>${cells.join('')}</tr>` }
function totalRow(cells) { return `<tr class="total-row">${cells.join('')}</tr>` }
function emptyRow(cols, msg) { return `<tr><td colspan="${cols}" class="empty-cell">${msg || 'No records for this month'}</td></tr>` }

function sectionHeader(icon, title, color) {
  return `<div class="section-header" style="border-left-color:${color}"><span class="sh-icon">${icon}</span><span class="sh-title">${title}</span></div>`
}

function statCard(label, value, sub, variant) {
  return `<div class="stat-card${variant ? ' ' + variant : ''}"><div class="stat-label">${label}</div><div class="stat-value">${value}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div>`
}

function catBar(name, amount, total) {
  const pct = total > 0 ? (amount / total) * 100 : 0
  return `
    <div class="cat-row">
      <div class="cat-name">${esc(name)}</div>
      <div class="cat-bar-wrap"><div class="cat-bar" style="width:${pct.toFixed(1)}%"></div></div>
      <div class="cat-amount">${formatCurrency(amount)}</div>
      <div class="cat-pct">${pct.toFixed(1)}%</div>
    </div>`
}

const CSS = `
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Segoe UI',Arial,sans-serif; font-size:11px; color:#1e293b; background:#fff; line-height:1.45; }

/* ── Cover ── */
.cover {
  background: linear-gradient(135deg,#0f172a 0%,#1e3a8a 55%,#1d4ed8 100%);
  color:#fff; padding:38px 44px 30px; position:relative; overflow:hidden;
}
.cover::before {
  content:''; position:absolute; right:-80px; top:-80px;
  width:260px; height:260px; background:rgba(255,255,255,0.06); border-radius:50%;
}
.cover::after {
  content:''; position:absolute; right:60px; bottom:-40px;
  width:140px; height:140px; background:rgba(255,255,255,0.04); border-radius:50%;
}
.cover-top { display:flex; justify-content:space-between; align-items:flex-start; }
.cover-icon { font-size:40px; line-height:1; }
.cover-badge {
  background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.28);
  border-radius:20px; padding:5px 16px; font-size:10px; font-weight:700;
  letter-spacing:0.08em; text-transform:uppercase;
}
.cover-farm { font-size:28px; font-weight:800; margin-top:18px; letter-spacing:-0.5px; }
.cover-location { font-size:12px; opacity:.65; margin-top:5px; }
.cover-divider { border:none; border-top:1px solid rgba(255,255,255,0.18); margin:22px 0 16px; }
.cover-bottom { display:flex; justify-content:space-between; align-items:flex-end; }
.cover-month { font-size:20px; font-weight:700; }
.cover-meta { font-size:10px; opacity:.55; margin-top:4px; }
.cover-records { text-align:right; }
.cover-records-num { font-size:22px; font-weight:800; }
.cover-records-lbl { font-size:10px; opacity:.6; }

/* ── Hero Strip ── */
.hero-strip { display:grid; grid-template-columns:repeat(4,1fr); background:#f8fafc; border-bottom:1px solid #e2e8f0; }
.hero-kpi { padding:18px 20px; border-right:1px solid #e2e8f0; }
.hero-kpi:last-child { border-right:none; }
.hero-kpi-label { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#64748b; margin-bottom:6px; }
.hero-kpi-value { font-size:19px; font-weight:800; color:#0f172a; }
.hero-kpi-sub { font-size:9px; color:#94a3b8; margin-top:3px; }
.hero-kpi.hgreen .hero-kpi-value { color:#16a34a; }
.hero-kpi.hred   .hero-kpi-value { color:#dc2626; }
.hero-kpi.hblue  .hero-kpi-value { color:#2563eb; }
.hero-kpi.hamber .hero-kpi-value { color:#d97706; }

/* ── Body ── */
.body { padding:20px 32px; }

/* ── Section ── */
.section { margin-bottom:22px; }
.section-header { display:flex; align-items:center; gap:10px; border-left:4px solid #2563eb; padding-left:12px; margin-bottom:10px; }
.sh-icon { font-size:14px; line-height:1; }
.sh-title { font-size:12px; font-weight:800; color:#0f172a; text-transform:uppercase; letter-spacing:.06em; }

/* ── Stat Cards ── */
.stat-grid { display:grid; gap:8px; margin-bottom:10px; }
.stat-grid-4 { grid-template-columns:repeat(4,1fr); }
.stat-grid-3 { grid-template-columns:repeat(3,1fr); }
.stat-grid-2 { grid-template-columns:repeat(2,1fr); }
.stat-card { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:9px 12px; }
.stat-card.sc-green { background:#f0fdf4; border-color:#bbf7d0; }
.stat-card.sc-red   { background:#fff5f5; border-color:#fecaca; }
.stat-card.sc-amber { background:#fffbeb; border-color:#fde68a; }
.stat-card.sc-blue  { background:#eff6ff; border-color:#bfdbfe; }
.stat-card.sc-purple{ background:#faf5ff; border-color:#ddd6fe; }
.stat-label { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:#64748b; margin-bottom:4px; }
.stat-value { font-size:15px; font-weight:800; color:#0f172a; }
.stat-card.sc-green .stat-value  { color:#16a34a; }
.stat-card.sc-red   .stat-value  { color:#dc2626; }
.stat-card.sc-amber .stat-value  { color:#d97706; }
.stat-card.sc-blue  .stat-value  { color:#2563eb; }
.stat-card.sc-purple.stat-value  { color:#7c3aed; }
.stat-sub { font-size:9px; color:#94a3b8; margin-top:2px; }

/* ── Tables ── */
table { width:100%; border-collapse:collapse; font-size:11px; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; margin-bottom:0; }
thead { background:#1e3a8a; }
th { color:#fff; padding:7px 10px; text-align:left; font-weight:600; font-size:9.5px; text-transform:uppercase; letter-spacing:.04em; }
th.num { text-align:right; }
td { padding:6px 10px; border-bottom:1px solid #f1f5f9; color:#334155; vertical-align:top; }
tr:nth-child(even) td { background:#f8fafc; }
tr:last-child td { border-bottom:none; }
td.num { text-align:right; font-variant-numeric:tabular-nums; }
td.bold { font-weight:700; color:#0f172a; }
td.green { color:#16a34a; font-weight:600; }
td.red   { color:#dc2626; font-weight:600; }
td.amber { color:#d97706; font-weight:600; }
td.purple{ color:#7c3aed; font-weight:600; }
td.muted { color:#94a3b8; font-size:10px; }
.total-row td { font-weight:700; background:#eff4ff !important; color:#1e3a8a; border-top:2px solid #2563eb; font-size:12px; }
.empty-cell { text-align:center; color:#94a3b8; padding:20px; font-style:italic; }

/* ── Subsection label ── */
.sub-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:#64748b; margin:10px 0 6px; }

/* ── Category bars ── */
.cat-bars { margin-top:4px; }
.cat-row { display:flex; align-items:center; gap:8px; margin-bottom:7px; }
.cat-name { width:120px; font-size:10px; font-weight:600; color:#334155; flex-shrink:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cat-bar-wrap { flex:1; background:#f1f5f9; border-radius:4px; height:11px; overflow:hidden; }
.cat-bar { height:100%; border-radius:4px; background:linear-gradient(90deg,#2563eb,#60a5fa); }
.cat-amount { width:90px; text-align:right; font-size:10px; font-weight:600; color:#0f172a; flex-shrink:0; }
.cat-pct { width:36px; text-align:right; font-size:10px; color:#64748b; flex-shrink:0; }

/* ── Profit Highlight ── */
.profit-card {
  border-radius:10px; padding:20px 24px;
  display:flex; justify-content:space-between; align-items:center;
  margin-bottom:20px;
}
.profit-lbl { font-size:14px; font-weight:800; color:#0f172a; }
.profit-sub { font-size:11px; color:#64748b; margin-top:5px; }
.profit-val { font-size:30px; font-weight:900; text-align:right; }
.profit-margin-lbl { font-size:11px; font-weight:600; text-align:right; margin-top:2px; }

/* ── Financial Boxes ── */
.fin-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
.fin-box { border:1px solid #e2e8f0; border-radius:10px; overflow:hidden; }
.fin-box-hdr { background:#1e3a8a; color:#fff; padding:9px 16px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; }
.fin-row { display:flex; justify-content:space-between; align-items:center; padding:9px 16px; border-bottom:1px solid #f1f5f9; font-size:12px; }
.fin-row:last-child { border-bottom:none; }
.fin-row.even { background:#f8fafc; }
.fin-divider { border:none; border-top:2px solid #2563eb; }
.fin-total { display:flex; justify-content:space-between; align-items:center; padding:11px 16px; background:#eff4ff; font-size:14px; font-weight:800; color:#1e3a8a; }
.fin-lbl { color:#64748b; font-size:11px; }
.fin-val { font-weight:600; color:#0f172a; }
.fin-green { color:#16a34a !important; font-weight:700; }
.fin-red   { color:#dc2626 !important; font-weight:700; }

/* ── Page Footer ── */
.page-footer { margin:0 36px; padding:12px 0; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; font-size:9px; color:#94a3b8; }
.footer-brand { font-weight:600; color:#64748b; }

@media print {
  /* Let sections break naturally — avoid forces huge gaps when a section overflows */
  .section-header { page-break-after:avoid; page-break-inside:avoid; }
  .stat-grid      { page-break-inside:avoid; }
  thead           { display:table-header-group; }
  .cover,.hero-strip,.profit-card,.fin-grid {
    -webkit-print-color-adjust:exact; print-color-adjust:exact;
  }
}
`

function buildPricingHtml({ totalExpenses, grossRevenue, cratesSold, projectedCrates, label }) {
  const proj = projectedCrates || cratesSold
  const hasSales = cratesSold > 0
  const actualAvg   = hasSales ? grossRevenue / cratesSold : 0
  const breakEven   = hasSales ? totalExpenses / cratesSold : 0
  const surplus     = actualAvg - breakEven
  const costRatio   = grossRevenue > 0 ? (totalExpenses / grossRevenue * 100).toFixed(1) : '0.0'
  const isProfitable = surplus >= 0

  const targets = proj > 0 ? [
    { label: 'Break Even',  price: totalExpenses / proj },
    { label: '10% Profit',  price: totalExpenses / (proj * 0.90) },
    { label: '20% Profit',  price: totalExpenses / (proj * 0.80) },
    { label: '30% Profit',  price: totalExpenses / (proj * 0.70) },
  ] : []

  const minCrates = actualAvg > 0 ? Math.ceil(totalExpenses / actualAvg) : null

  const statusMsg = hasSales
    ? isProfitable
      ? `✅ Each crate earned ${formatCurrency(surplus)} above cost. Keep pricing at or above ${formatCurrency(breakEven)}/crate to stay profitable.`
      : `⚠ Each crate lost ${formatCurrency(Math.abs(surplus))}. You must charge at least ${formatCurrency(breakEven)}/crate to break even.`
    : 'No sales data available for this period.'

  return `
<div class="section">
  <div class="section-header" style="border-left-color:#2563eb">
    <span class="sh-icon">💡</span>
    <span class="sh-title">Pricing Intelligence &amp; Next Month Targets</span>
  </div>

  <div class="stat-grid stat-grid-4" style="margin-bottom:10px">
    ${statCard('Actual Avg Price/Crate', hasSales ? formatCurrency(actualAvg) : '—', 'This period', 'sc-blue')}
    ${statCard('Break-Even Price/Crate', hasSales ? formatCurrency(breakEven) : '—', 'Min to cover expenses', '')}
    ${statCard('Surplus / Deficit/Crate', hasSales ? (isProfitable ? '+' : '') + formatCurrency(surplus) : '—', isProfitable ? 'Above cost' : 'Below cost', isProfitable ? 'sc-green' : 'sc-red')}
    ${statCard('Cost Ratio', `${costRatio}%`, 'Expenses ÷ Revenue', parseFloat(costRatio) > 100 ? 'sc-red' : parseFloat(costRatio) > 80 ? 'sc-amber' : 'sc-green')}
  </div>

  <div style="background:${isProfitable ? '#f0fdf4' : '#fff7ed'};border:1px solid ${isProfitable ? '#bbf7d0' : '#fed7aa'};border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:11px;color:${isProfitable ? '#166534' : '#92400e'}">
    ${statusMsg}
  </div>

  ${targets.length > 0 ? `
  <div class="sub-label">Target prices for next period — based on ${proj} projected crates &amp; ${formatCurrency(totalExpenses)} expenses</div>
  <table>
    <thead><tr>${th('Target')}${th('Price / Crate', 'num')}${th('Total Revenue Needed', 'num')}${th('vs. This Period', 'num')}</tr></thead>
    <tbody>
      ${targets.map(t => trow([
        td(esc(t.label), 'bold'),
        td(formatCurrency(t.price), 'num bold'),
        td(formatCurrency(t.price * proj), 'num'),
        td(hasSales ? (t.price > actualAvg ? `+${formatCurrency(t.price - actualAvg)}` : t.price === actualAvg ? 'Same' : formatCurrency(t.price - actualAvg)) : '—',
           `num ${hasSales && t.price > actualAvg ? 'green' : hasSales && t.price < actualAvg ? 'red' : ''}`),
      ])).join('')}
    </tbody>
  </table>
  ` : ''}

  ${minCrates !== null ? `
  <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;margin-top:10px;font-size:11px;color:#1e3a8a">
    📦 At your current avg price of <strong>${formatCurrency(actualAvg)}/crate</strong>, you must sell at least <strong>${minCrates} crates</strong> to cover all expenses.${cratesSold < minCrates ? ` This period you sold ${cratesSold} — <strong style="color:#dc2626">${minCrates - cratesSold} more crates needed</strong>.` : ` This period you sold ${cratesSold} — target met ✅`}
  </div>
  ` : ''}
</div>`
}

export function buildMonthlyReportHtml({ summary, production, sales, domestic, expenses, health, feed, mortality, settings, monthYear, feedStock }) {
  const farmName  = settings?.farm_name     || 'Eldesign Poultry Farm'
  const farmLoc   = settings?.farm_location || ''
  const monthLbl  = formatMonthYear(monthYear)
  const genAt     = dayjs().format('DD MMM YYYY, h:mm A')

  const {
    opening, totalProduced, closingStockCrates, closingStockPieces,
    grossRevenue, openingBalance, totalExpenses, closingBalance,
    bestSellingSize, avgCratePrice,
  } = summary

  const netProfit    = grossRevenue - totalExpenses
  const profitMargin = grossRevenue > 0 ? ((netProfit / grossRevenue) * 100).toFixed(1) : '0.0'
  const totalCashIn  = openingBalance + grossRevenue

  // ── Production aggregates ──────────────────────────────────
  const prodByDate = {}
  production.forEach(r => {
    if (!prodByDate[r.date]) prodByDate[r.date] = {}
    prodByDate[r.date][r.flock_name || r.layer_type || 'Unknown'] = r
  })
  const totalL1 = production.filter(r => r.layer_type === 'L1').reduce((s, r) => s + r.total_eggs, 0)
  const totalL2 = production.filter(r => r.layer_type === 'L2').reduce((s, r) => s + r.total_eggs, 0)

  // ── Sales aggregates ──────────────────────────────────────
  const totalCratesSold = sales.reduce((s, r) => s + (r.crates || 0), 0)
  const salesBySize = {}
  sales.forEach(r => {
    if (!salesBySize[r.egg_size]) salesBySize[r.egg_size] = { qty: 0, rev: 0 }
    salesBySize[r.egg_size].qty += r.crates || 0
    salesBySize[r.egg_size].rev += r.total_revenue || 0
  })

  // ── Domestic aggregates ───────────────────────────────────
  const totalDomEggs = domestic.reduce((s, r) => s + ((r.crates || 0) * 30) + (r.pieces || 0), 0)

  // ── Expense aggregates ────────────────────────────────────
  const expByCat = {}
  expenses.forEach(r => { expByCat[r.category] = (expByCat[r.category] || 0) + r.amount })
  const sortedCats = Object.entries(expByCat).sort(([, a], [, b]) => b - a)

  // ── Feed aggregates ───────────────────────────────────────
  const totalFeedKg   = feed.reduce((s, r) => s + (r.quantity_kg || 0), 0)
  const totalFeedCost = feed.reduce((s, r) => s + (r.total_cost || 0), 0)
  const feedByType = {}
  feed.forEach(r => {
    if (!feedByType[r.feed_type]) feedByType[r.feed_type] = { kg: 0 }
    feedByType[r.feed_type].kg += r.quantity_kg || 0
  })

  // ── Mortality aggregates ──────────────────────────────────
  const totalMortality = mortality.reduce((s, r) => s + (r.count || 0), 0)
  const mortByReason = {}
  mortality.forEach(r => { mortByReason[r.reason] = (mortByReason[r.reason] || 0) + (r.count || 0) })

  // ── Health aggregates ─────────────────────────────────────
  const totalHealthCost = health.reduce((s, r) => s + (r.cost || 0), 0)
  const healthByType = {}
  health.forEach(r => {
    healthByType[r.record_type] = (healthByType[r.record_type] || 0) + 1
  })

  const totalRecords = production.length + sales.length + domestic.length + expenses.length + feed.length + health.length + mortality.length

  // ══════════════════════════════════════════════════════════
  //  BUILD TABLE ROWS
  // ══════════════════════════════════════════════════════════

  // Production daily rows
  const prodRows = production
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(r => trow([
      td(formatDate(r.date), 'bold'),
      td(esc(r.flock_name || LAYER_LABELS[r.layer_type] || r.layer_type || '—')),
      td(r.no_of_birds ? r.no_of_birds.toLocaleString() : '—', 'num'),
      td(`${r.crates}c ${r.pieces}p`, 'num'),
      td(r.total_eggs?.toLocaleString() ?? '—', 'num bold'),
      td(r.daily_yield_pct ? `${r.daily_yield_pct}%` : '—', 'num'),
      td(esc(r.notes) || '—', 'muted'),
    ])).join('')

  // Sales rows
  const salesRows = sales
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(r => trow([
      td(formatDate(r.date), 'bold'),
      td(esc(r.egg_size)),
      td(esc(r.flock_name || LAYER_LABELS[r.layer_type] || r.layer_type || '—')),
      td(`${r.crates}c ${r.pieces || 0}p`, 'num'),
      td(formatCurrency(r.price_per_crate), 'num'),
      td(formatCurrency(r.total_revenue), 'num green'),
      td(esc(r.buyer_name) || '—'),
      td(esc(r.payment_method) || '—'),
    ])).join('')

  const salesBySizeRows = Object.entries(salesBySize)
    .sort(([, a], [, b]) => b.rev - a.rev)
    .map(([size, d]) => trow([
      td(esc(size), 'bold'),
      td(`${d.qty} crates`, 'num'),
      td(formatCurrency(d.rev), 'num green'),
      td(grossRevenue > 0 ? `${((d.rev / grossRevenue) * 100).toFixed(1)}%` : '0%', 'num'),
    ])).join('')

  // Domestic rows
  const domRows = domestic
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(r => trow([
      td(formatDate(r.date), 'bold'),
      td(esc(r.location) || '—'),
      td(esc(r.flock_name || LAYER_LABELS[r.layer_type] || r.layer_type || '—')),
      td(`${r.crates}c ${r.pieces || 0}p`, 'num'),
      td(formatEggs((r.crates || 0) * 30 + (r.pieces || 0)), 'num'),
      td(esc(r.notes) || '—', 'muted'),
    ])).join('')

  // Expense rows
  const expRows = expenses
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(r => trow([
      td(formatDate(r.date), 'bold'),
      td(esc(r.category)),
      td(esc(r.description) || '—'),
      td(esc(r.payment_method) || '—'),
      td(esc(r.vendor) || '—'),
      td(formatCurrency(r.amount), 'num red'),
      td(esc(r.notes) || '—', 'muted'),
    ])).join('')

  // Feed rows
  const feedRows = feed
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(r => trow([
      td(formatDate(r.date), 'bold'),
      td(esc(r.flock_name || 'All Flocks')),
      td(esc(r.feed_type)),
      td(r.quantity_kg ? `${r.quantity_kg} kg` : '—', 'num'),
      td(esc(r.notes) || '—', 'muted'),
    ])).join('')

  const feedByTypeRows = Object.entries(feedByType)
    .sort(([, a], [, b]) => b.kg - a.kg)
    .map(([type, d]) => trow([
      td(esc(type), 'bold'),
      td(`${d.kg.toFixed(1)} kg`, 'num'),
      td(totalFeedKg > 0 ? `${((d.kg / totalFeedKg) * 100).toFixed(1)}%` : '0%', 'num'),
    ])).join('')

  // Mortality rows
  const mortRows = mortality
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(r => trow([
      td(formatDate(r.date), 'bold'),
      td(esc(r.flock_name || '—')),
      td(esc(r.reason)),
      td(r.count?.toLocaleString() ?? '—', 'num red'),
      td(esc(r.notes) || '—', 'muted'),
    ])).join('')

  const mortByReasonRows = Object.entries(mortByReason)
    .sort(([, a], [, b]) => b - a)
    .map(([reason, count]) => trow([
      td(esc(reason), 'bold'),
      td(count.toLocaleString(), 'num red'),
      td(totalMortality > 0 ? `${((count / totalMortality) * 100).toFixed(1)}%` : '0%', 'num'),
    ])).join('')

  // Health rows
  const healthRows = health
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(r => trow([
      td(formatDate(r.date), 'bold'),
      td(esc(r.flock_name || '—')),
      td(esc(r.record_type), 'purple'),
      td(esc(r.name), 'bold'),
      td(esc(r.dosage) || '—'),
      td(esc(r.administered_by) || '—'),
      td(r.cost ? formatCurrency(r.cost) : '—', 'num'),
      td(r.next_due_date ? formatDate(r.next_due_date) : '—', 'amber'),
      td(esc(r.notes) || '—', 'muted'),
    ])).join('')

  const healthByTypeRows = Object.entries(healthByType)
    .sort(([, a], [, b]) => b - a)
    .map(([type, count]) => trow([
      td(esc(type), 'bold purple'),
      td(count.toString(), 'num'),
      td(formatCurrency(health.filter(r => r.record_type === type).reduce((s, r) => s + (r.cost || 0), 0)), 'num'),
    ])).join('')

  // ══════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>${esc(farmName)} — ${esc(monthLbl)} Report</title>
  <style>${CSS}</style>
</head>
<body>

<!-- ╔══════════════════════════════════════════════════════════╗ -->
<!--   COVER                                                      -->
<!-- ╚══════════════════════════════════════════════════════════╝ -->
<div class="cover">
  <div class="cover-top">
    <div class="cover-icon">🐔</div>
    <div class="cover-badge">Official Monthly Farm Report</div>
  </div>
  <div class="cover-farm">${esc(farmName)}</div>
  ${farmLoc ? `<div class="cover-location">📍 ${esc(farmLoc)}</div>` : ''}
  <hr class="cover-divider"/>
  <div class="cover-bottom">
    <div>
      <div class="cover-month">${esc(monthLbl)}</div>
      <div class="cover-meta">Generated: ${genAt}</div>
    </div>
    <div class="cover-records">
      <div class="cover-records-num">${totalRecords}</div>
      <div class="cover-records-lbl">Total Records</div>
    </div>
  </div>
</div>

<!-- ╔══════════════════════════════════════════════════════════╗ -->
<!--   HERO KPIs                                                  -->
<!-- ╚══════════════════════════════════════════════════════════╝ -->
<div class="hero-strip">
  <div class="hero-kpi hblue">
    <div class="hero-kpi-label">Total Production</div>
    <div class="hero-kpi-value">${formatEggs(totalProduced)}</div>
    <div class="hero-kpi-sub">L1: ${formatEggs(totalL1)} &nbsp;|&nbsp; L2: ${formatEggs(totalL2)}</div>
  </div>
  <div class="hero-kpi hgreen">
    <div class="hero-kpi-label">Gross Revenue</div>
    <div class="hero-kpi-value">${formatCurrency(grossRevenue)}</div>
    <div class="hero-kpi-sub">${totalCratesSold} crates sold</div>
  </div>
  <div class="hero-kpi hred">
    <div class="hero-kpi-label">Total Expenses</div>
    <div class="hero-kpi-value">${formatCurrency(totalExpenses)}</div>
    <div class="hero-kpi-sub">${expenses.length} transactions · ${sortedCats.length} categories</div>
  </div>
  <div class="hero-kpi ${netProfit >= 0 ? 'hgreen' : 'hred'}">
    <div class="hero-kpi-label">Net Profit / Loss</div>
    <div class="hero-kpi-value">${formatCurrency(netProfit)}</div>
    <div class="hero-kpi-sub">Margin: ${profitMargin}%</div>
  </div>
</div>

<div class="body">

<!-- ╔══════════════════════════════════════════════════════════╗ -->
<!--   SECTION 1 — PRODUCTION                                     -->
<!-- ╚══════════════════════════════════════════════════════════╝ -->
<div class="section">
  ${sectionHeader('🥚', '1. Production Record', '#2563eb')}
  <div class="stat-grid stat-grid-4">
    ${statCard('Total Eggs Produced', formatEggs(totalProduced), `${production.length} daily entries`, 'sc-blue')}
    ${statCard('Old Layers (L1)', formatEggs(totalL1), 'Cumulative', '')}
    ${statCard('New Layers (L2)', formatEggs(totalL2), 'Cumulative', '')}
    ${statCard('Closing Stock', `${closingStockCrates}c ${closingStockPieces}p`, 'End of month', 'sc-green')}
  </div>
  <table>
    <thead><tr>
      ${th('Date')}${th('Flock / Layer')}${th('Birds', 'num')}${th('Quantity', 'num')}${th('Total Eggs', 'num')}${th('Yield %', 'num')}${th('Notes')}
    </tr></thead>
    <tbody>
      ${prodRows || emptyRow(7)}
      ${prodRows ? totalRow([
        `<td colspan="3" class="bold">MONTHLY TOTAL</td>`,
        td(formatEggs(totalProduced), 'num'),
        `<td class="num" style="font-size:13px">${formatEggs(totalProduced)}</td>`,
        td('—', 'num'), td(''),
      ]) : ''}
    </tbody>
  </table>
</div>

<!-- ╔══════════════════════════════════════════════════════════╗ -->
<!--   SECTION 2 — SALES                                          -->
<!-- ╚══════════════════════════════════════════════════════════╝ -->
<div class="section">
  ${sectionHeader('💰', '2. Sales Record', '#16a34a')}
  <div class="stat-grid stat-grid-4">
    ${statCard('Gross Revenue', formatCurrency(grossRevenue), `${sales.length} transactions`, 'sc-green')}
    ${statCard('Crates Sold', totalCratesSold.toString(), 'This month', '')}
    ${statCard('Best Selling Size', bestSellingSize || '—', '', 'sc-amber')}
    ${statCard('Avg Price / Crate', formatCurrency(avgCratePrice), '', 'sc-blue')}
  </div>
  <table>
    <thead><tr>
      ${th('Date')}${th('Egg Size')}${th('Flock / Layer')}${th('Quantity', 'num')}${th('Price/Crate', 'num')}${th('Revenue', 'num')}${th('Buyer')}${th('Payment')}
    </tr></thead>
    <tbody>
      ${salesRows || emptyRow(8)}
      ${salesRows ? totalRow([
        `<td colspan="5" class="bold">TOTAL REVENUE</td>`,
        `<td class="num" style="color:#16a34a;font-size:13px">${formatCurrency(grossRevenue)}</td>`,
        td(''), td(''),
      ]) : ''}
    </tbody>
  </table>

  ${Object.keys(salesBySize).length > 1 ? `
  <div class="sub-label">Revenue Breakdown by Egg Size</div>
  <table>
    <thead><tr>${th('Egg Size')}${th('Crates Sold', 'num')}${th('Revenue', 'num')}${th('% of Total', 'num')}</tr></thead>
    <tbody>
      ${salesBySizeRows}
      ${totalRow([td('TOTAL', 'bold'), td(totalCratesSold + ' crates', 'num'), td(formatCurrency(grossRevenue), 'num green'), td('100%', 'num')])}
    </tbody>
  </table>
  ` : ''}
</div>

<!-- ╔══════════════════════════════════════════════════════════╗ -->
<!--   SECTION 3 — DOMESTIC USAGE                                 -->
<!-- ╚══════════════════════════════════════════════════════════╝ -->
<div class="section">
  ${sectionHeader('🏠', '3. Domestic Usage & Gifting', '#7c3aed')}
  <div class="stat-grid stat-grid-3">
    ${statCard('Total Eggs Used', formatEggs(totalDomEggs), 'Not sold', 'sc-purple')}
    ${statCard('Transactions', domestic.length.toString(), '', '')}
    ${statCard('Unique Locations', [...new Set(domestic.map(r => r.location).filter(Boolean))].length.toString() || domestic.length.toString(), '', 'sc-amber')}
  </div>
  <table>
    <thead><tr>
      ${th('Date')}${th('Location / Purpose')}${th('Flock / Layer')}${th('Quantity', 'num')}${th('Total Eggs', 'num')}${th('Notes')}
    </tr></thead>
    <tbody>
      ${domRows || emptyRow(6)}
      ${domRows ? totalRow([
        `<td colspan="4" class="bold">TOTAL DOMESTIC</td>`,
        `<td class="num">${formatEggs(totalDomEggs)}</td>`,
        td(''),
      ]) : ''}
    </tbody>
  </table>
</div>

<!-- ╔══════════════════════════════════════════════════════════╗ -->
<!--   SECTION 4 — EXPENSES                                       -->
<!-- ╚══════════════════════════════════════════════════════════╝ -->
<div class="section">
  ${sectionHeader('📋', '4. Expenses Record', '#dc2626')}
  <div class="stat-grid stat-grid-4">
    ${statCard('Total Expenses', formatCurrency(totalExpenses), `${expenses.length} transactions`, 'sc-red')}
    ${statCard('Categories', sortedCats.length.toString(), '', '')}
    ${statCard('Top Category', sortedCats[0]?.[0] || '—', sortedCats[0] ? formatCurrency(sortedCats[0][1]) : '', 'sc-amber')}
    ${statCard('Cost/Revenue Ratio', grossRevenue > 0 ? `${((totalExpenses / grossRevenue) * 100).toFixed(1)}%` : '0%', 'of gross revenue', '')}
  </div>
  <table>
    <thead><tr>
      ${th('Date')}${th('Category')}${th('Description')}${th('Payment')}${th('Vendor')}${th('Amount', 'num')}${th('Notes')}
    </tr></thead>
    <tbody>
      ${expRows || emptyRow(7)}
      ${expRows ? totalRow([
        `<td colspan="5" class="bold">TOTAL EXPENSES</td>`,
        `<td class="num" style="color:#dc2626;font-size:13px">${formatCurrency(totalExpenses)}</td>`,
        td(''),
      ]) : ''}
    </tbody>
  </table>

  ${sortedCats.length > 0 ? `
  <div class="sub-label">Spending by Category</div>
  <div class="cat-bars">${sortedCats.map(([cat, amt]) => catBar(cat, amt, totalExpenses)).join('')}</div>
  ` : ''}
</div>

<!-- ╔══════════════════════════════════════════════════════════╗ -->
<!--   SECTION 5 — FEED LOG                                       -->
<!-- ╚══════════════════════════════════════════════════════════╝ -->
<div class="section">
  ${sectionHeader('🌾', '5. Feed Log (Consumption)', '#d97706')}
  <div class="stat-grid stat-grid-${feedStock && feedStock.stockOnHandKg > 0 ? '4' : '3'}">
    ${statCard('Total Used This Month', `${totalFeedKg.toFixed(1)} kg`, `${feed.length} entries`, 'sc-amber')}
    ${statCard('Feed Types', Object.keys(feedByType).length.toString(), '', '')}
    ${feedStock ? statCard('Total Purchased', `${(feedStock.totalPurchasedKg||0).toFixed(1)} kg`, 'all-time', '') : ''}
    ${feedStock && feedStock.stockOnHandKg > 0 ? statCard('Stock on Hand', `${feedStock.stockOnHandKg.toFixed(1)} kg`, `${(feedStock.totalConsumedKg||0).toFixed(1)} kg consumed`, 'sc-green') : ''}
  </div>
  <table>
    <thead><tr>
      ${th('Date')}${th('Flock')}${th('Feed Type')}${th('Used (kg)', 'num')}${th('Notes')}
    </tr></thead>
    <tbody>
      ${feedRows || emptyRow(5)}
      ${feedRows ? totalRow([
        `<td colspan="3" class="bold">TOTAL</td>`,
        `<td class="num">${totalFeedKg.toFixed(1)} kg</td>`,
        td(''),
      ]) : ''}
    </tbody>
  </table>

  ${Object.keys(feedByType).length > 1 ? `
  <div class="sub-label">Consumption by Feed Type</div>
  <table>
    <thead><tr>${th('Feed Type')}${th('Used (kg)', 'num')}${th('% of Total', 'num')}</tr></thead>
    <tbody>${feedByTypeRows}</tbody>
  </table>
  ` : ''}
</div>

<!-- ╔══════════════════════════════════════════════════════════╗ -->
<!--   SECTION 6 — FLOCK MOVEMENTS / MORTALITY                    -->
<!-- ╚══════════════════════════════════════════════════════════╝ -->
<div class="section">
  ${sectionHeader('📉', '6. Flock Movements & Mortality', '#64748b')}
  <div class="stat-grid stat-grid-3">
    ${statCard('Total Removed', totalMortality.toLocaleString(), `${mortality.length} events`, totalMortality > 0 ? 'sc-red' : '')}
    ${statCard('Reasons Recorded', Object.keys(mortByReason).length.toString(), '', '')}
    ${statCard('Movement Events', mortality.length.toString(), 'This month', '')}
  </div>
  <table>
    <thead><tr>
      ${th('Date')}${th('Flock')}${th('Reason')}${th('Count', 'num')}${th('Notes')}
    </tr></thead>
    <tbody>
      ${mortRows || emptyRow(5)}
      ${mortRows ? totalRow([
        `<td colspan="3" class="bold">TOTAL REMOVED</td>`,
        `<td class="num" style="color:#dc2626">${totalMortality.toLocaleString()}</td>`,
        td(''),
      ]) : ''}
    </tbody>
  </table>

  ${Object.keys(mortByReason).length > 1 ? `
  <div class="sub-label">Breakdown by Reason</div>
  <table>
    <thead><tr>${th('Reason')}${th('Count', 'num')}${th('% of Total', 'num')}</tr></thead>
    <tbody>${mortByReasonRows}</tbody>
  </table>
  ` : ''}
</div>

<!-- ╔══════════════════════════════════════════════════════════╗ -->
<!--   SECTION 7 — POULTRY HEALTH                                 -->
<!-- ╚══════════════════════════════════════════════════════════╝ -->
<div class="section">
  ${sectionHeader('💉', '7. Poultry Health Records', '#7c3aed')}
  <div class="stat-grid stat-grid-4">
    ${statCard('Health Events', health.length.toString(), 'This month', 'sc-purple')}
    ${statCard('Total Health Cost', formatCurrency(totalHealthCost), '', 'sc-red')}
    ${statCard('Vaccinations', (healthByType['Vaccination'] || 0).toString(), '', '')}
    ${statCard('Treatments', (healthByType['Treatment'] || healthByType['Medication'] || 0).toString(), '', '')}
  </div>
  <table>
    <thead><tr>
      ${th('Date')}${th('Flock')}${th('Type')}${th('Name / Drug')}${th('Dosage')}${th('Administered By')}${th('Cost', 'num')}${th('Next Due')}${th('Notes')}
    </tr></thead>
    <tbody>
      ${healthRows || emptyRow(9)}
      ${healthRows ? totalRow([
        `<td colspan="6" class="bold">TOTAL HEALTH COST</td>`,
        `<td class="num">${formatCurrency(totalHealthCost)}</td>`,
        td(''), td(''),
      ]) : ''}
    </tbody>
  </table>

  ${Object.keys(healthByType).length > 1 ? `
  <div class="sub-label">Breakdown by Record Type</div>
  <table>
    <thead><tr>${th('Record Type')}${th('Count', 'num')}${th('Total Cost', 'num')}</tr></thead>
    <tbody>${healthByTypeRows}</tbody>
  </table>
  ` : ''}
</div>

<!-- ╔══════════════════════════════════════════════════════════╗ -->
<!--   SECTION 8 — PRICING INTELLIGENCE                           -->
<!-- ╚══════════════════════════════════════════════════════════╝ -->
${buildPricingHtml({ totalExpenses, grossRevenue, cratesSold: totalCratesSold, label: monthLbl })}

<!-- ╔══════════════════════════════════════════════════════════╗ -->
<!--   SECTION 9 — FINANCIAL SUMMARY                              -->
<!-- ╚══════════════════════════════════════════════════════════╝ -->
<div class="section">
  ${sectionHeader('📊', '8. Financial Summary', '#0891b2')}

  <!-- Profit highlight card -->
  <div class="profit-card" style="background:${netProfit >= 0 ? 'linear-gradient(135deg,#f0fdf4,#dcfce7)' : 'linear-gradient(135deg,#fff5f5,#fee2e2)'};border:2px solid ${netProfit >= 0 ? '#22c55e' : '#ef4444'}">
    <div>
      <div class="profit-lbl">${netProfit >= 0 ? '✅ Net Profit' : '❌ Net Loss'} &mdash; ${esc(monthLbl)}</div>
      <div class="profit-sub">Revenue ${formatCurrency(grossRevenue)} &minus; Expenses ${formatCurrency(totalExpenses)}</div>
    </div>
    <div>
      <div class="profit-val" style="color:${netProfit >= 0 ? '#16a34a' : '#dc2626'}">${formatCurrency(netProfit)}</div>
      <div class="profit-margin-lbl" style="color:${netProfit >= 0 ? '#22c55e' : '#ef4444'}">${profitMargin}% margin</div>
    </div>
  </div>

  <div class="fin-grid">
    <!-- Cash Flow Statement -->
    <div class="fin-box">
      <div class="fin-box-hdr">💵 Cash Flow Statement</div>
      <div class="fin-row"><span class="fin-lbl">Opening Balance</span><span class="fin-val">${formatCurrency(openingBalance)}</span></div>
      <div class="fin-row even"><span class="fin-lbl">+ Gross Revenue</span><span class="fin-green">+${formatCurrency(grossRevenue)}</span></div>
      <hr class="fin-divider"/>
      <div class="fin-row"><span class="fin-lbl">Total Cash In</span><span class="fin-val">${formatCurrency(totalCashIn)}</span></div>
      <div class="fin-row even"><span class="fin-lbl">− Operating Expenses</span><span class="fin-red">−${formatCurrency(totalExpenses)}</span></div>
      ${totalHealthCost > 0 ? `<div class="fin-row"><span class="fin-lbl">&nbsp;&nbsp;└ incl. Health Costs</span><span class="fin-val" style="font-size:10px;color:#94a3b8">${formatCurrency(totalHealthCost)}</span></div>` : ''}
      ${totalFeedCost  > 0 ? `<div class="fin-row even"><span class="fin-lbl">&nbsp;&nbsp;└ incl. Feed Costs</span><span class="fin-val" style="font-size:10px;color:#94a3b8">${formatCurrency(totalFeedCost)}</span></div>` : ''}
      <hr class="fin-divider"/>
      <div class="fin-total"><span>Closing Balance</span><span class="${closingBalance >= 0 ? 'fin-green' : 'fin-red'}">${formatCurrency(closingBalance)}</span></div>
    </div>

    <!-- Key Metrics -->
    <div class="fin-box">
      <div class="fin-box-hdr">📈 Key Metrics</div>
      <div class="fin-row"><span class="fin-lbl">Profit Margin</span><span class="${netProfit >= 0 ? 'fin-green' : 'fin-red'}">${profitMargin}%</span></div>
      <div class="fin-row even"><span class="fin-lbl">Cost / Revenue Ratio</span><span class="fin-val">${grossRevenue > 0 ? ((totalExpenses / grossRevenue) * 100).toFixed(1) : '0.0'}%</span></div>
      <div class="fin-row"><span class="fin-lbl">Avg Crate Price</span><span class="fin-val">${formatCurrency(avgCratePrice)}</span></div>
      <div class="fin-row even"><span class="fin-lbl">Best Selling Size</span><span class="fin-val">${bestSellingSize || '—'}</span></div>
      <div class="fin-row"><span class="fin-lbl">Total Eggs Produced</span><span class="fin-val">${formatEggs(totalProduced)}</span></div>
      <div class="fin-row even"><span class="fin-lbl">Crates Sold</span><span class="fin-val">${totalCratesSold} crates</span></div>
      <div class="fin-row"><span class="fin-lbl">Domestic / Gifted</span><span class="fin-val">${formatEggs(totalDomEggs)}</span></div>
      <div class="fin-row even"><span class="fin-lbl">Feed Consumed</span><span class="fin-val">${totalFeedKg} kg</span></div>
      <div class="fin-row"><span class="fin-lbl">Flock Removals</span><span class="${totalMortality > 0 ? 'fin-red' : 'fin-val'}">${totalMortality.toLocaleString()} birds</span></div>
      <div class="fin-row even"><span class="fin-lbl">Health Interventions</span><span class="fin-val">${health.length}</span></div>
      <hr class="fin-divider"/>
      <div class="fin-total"><span>Closing Stock</span><span>${closingStockCrates} crates, ${closingStockPieces} pcs</span></div>
    </div>
  </div>
</div>

</div><!-- /.body -->

<!-- ╔══════════════════════════════════════════════════════════╗ -->
<!--   FOOTER                                                     -->
<!-- ╚══════════════════════════════════════════════════════════╝ -->
<div class="page-footer">
  <span class="footer-brand">🐔 ${esc(farmName)}${farmLoc ? ` &nbsp;·&nbsp; 📍 ${esc(farmLoc)}` : ''}</span>
  <span>${esc(monthLbl)} Monthly Report &nbsp;·&nbsp; Generated ${genAt} &nbsp;·&nbsp; Confidential</span>
</div>

</body>
</html>`
}

// ══════════════════════════════════════════════════════════════════
//  ANNUAL REPORT
// ══════════════════════════════════════════════════════════════════

const MONTH_LABELS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function buildAnnualReportHtml({ year, monthlyData, settings, feedStock }) {
  const farmName = settings?.farm_name     || 'Eldesign Poultry Farm'
  const farmLoc  = settings?.farm_location || ''
  const genAt    = dayjs().format('DD MMM YYYY, h:mm A')

  // ── Aggregates ───────────────────────────────────────────────
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
  const activeMonths    = monthlyData.filter(d => d.summary.totalProduced > 0 || d.summary.grossRevenue > 0).length

  const expByCat = {}
  monthlyData.forEach(d => d.expenses.forEach(r => {
    expByCat[r.category] = (expByCat[r.category] || 0) + r.amount
  }))
  const sortedCats = Object.entries(expByCat).sort(([, a], [, b]) => b - a)

  const bestRevenueMonth = monthlyData.reduce((best, d) =>
    d.summary.grossRevenue > (best?.summary.grossRevenue || 0) ? d : best, null)

  const avgMonthlyRevenue  = activeMonths > 0 ? grossRevenue / activeMonths : 0
  const avgMonthlyExpenses = activeMonths > 0 ? totalExpenses / activeMonths : 0

  // ── Monthly rows ─────────────────────────────────────────────
  const monthRows = monthlyData.map((d, i) => {
    const rev = d.summary.grossRevenue
    const exp = d.summary.totalExpenses
    const pl  = rev - exp
    const margin = rev > 0 ? `${((pl / rev) * 100).toFixed(1)}%` : '—'
    const hasData = d.summary.totalProduced > 0 || rev > 0
    return trow([
      td(MONTH_LABELS_SHORT[i], 'bold'),
      td(hasData ? formatEggs(d.summary.totalProduced) : '—', 'num'),
      td(hasData ? formatCurrency(rev) : '—', `num ${hasData && rev > 0 ? 'green' : 'muted'}`),
      td(hasData ? formatCurrency(exp) : '—', `num ${hasData && exp > 0 ? 'red' : 'muted'}`),
      td(hasData ? formatCurrency(pl)  : '—', `num ${hasData ? (pl >= 0 ? 'green' : 'red') : 'muted'}`),
      td(hasData ? margin : '—', 'num muted'),
    ])
  }).join('')

  const monthTotalRow = totalRow([
    `<td class="bold">ANNUAL TOTAL</td>`,
    td(formatEggs(totalProduced), 'num'),
    `<td class="num" style="color:#16a34a;font-size:13px">${formatCurrency(grossRevenue)}</td>`,
    `<td class="num" style="color:#dc2626;font-size:13px">${formatCurrency(totalExpenses)}</td>`,
    `<td class="num" style="color:${netProfit >= 0 ? '#16a34a' : '#dc2626'};font-size:13px">${formatCurrency(netProfit)}</td>`,
    td(profitMargin + '%', 'num'),
  ])

  // ── Expense category bars ────────────────────────────────────
  const catBars = sortedCats.map(([cat, amt]) => catBar(cat, amt, totalExpenses)).join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>${esc(farmName)} — ${esc(year)} Annual Report</title>
  <style>${CSS}
  .annual-badge { background:rgba(255,255,255,0.2); border:1px solid rgba(255,255,255,0.35); border-radius:20px; padding:5px 16px; font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
  .metrics-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:18px; }
  .metric-tile { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; align-items:center; gap:10px; }
  .metric-icon { font-size:22px; }
  .metric-val  { font-size:14px; font-weight:800; color:#0f172a; }
  .metric-lbl  { font-size:9px; color:#64748b; text-transform:uppercase; letter-spacing:.06em; margin-top:2px; }
  </style>
</head>
<body>

<!-- COVER -->
<div class="cover">
  <div class="cover-top">
    <div class="cover-icon">🐔</div>
    <div class="annual-badge">Full Year Annual Report</div>
  </div>
  <div class="cover-farm">${esc(farmName)}</div>
  ${farmLoc ? `<div class="cover-location">📍 ${esc(farmLoc)}</div>` : ''}
  <hr class="cover-divider"/>
  <div class="cover-bottom">
    <div>
      <div class="cover-month">${esc(year)} — Full Year</div>
      <div class="cover-meta">Generated: ${genAt} &nbsp;·&nbsp; ${activeMonths} active months</div>
    </div>
    <div class="cover-records">
      <div class="cover-records-num">${activeMonths}/12</div>
      <div class="cover-records-lbl">Months with Data</div>
    </div>
  </div>
</div>

<!-- HERO KPIs -->
<div class="hero-strip">
  <div class="hero-kpi hblue">
    <div class="hero-kpi-label">Total Production</div>
    <div class="hero-kpi-value">${formatEggs(totalProduced)}</div>
    <div class="hero-kpi-sub">${totalCratesSold} crates sold</div>
  </div>
  <div class="hero-kpi hgreen">
    <div class="hero-kpi-label">Annual Revenue</div>
    <div class="hero-kpi-value">${formatCurrency(grossRevenue)}</div>
    <div class="hero-kpi-sub">Avg ${formatCurrency(avgMonthlyRevenue)} / month</div>
  </div>
  <div class="hero-kpi hred">
    <div class="hero-kpi-label">Annual Expenses</div>
    <div class="hero-kpi-value">${formatCurrency(totalExpenses)}</div>
    <div class="hero-kpi-sub">Avg ${formatCurrency(avgMonthlyExpenses)} / month</div>
  </div>
  <div class="hero-kpi ${netProfit >= 0 ? 'hgreen' : 'hred'}">
    <div class="hero-kpi-label">Annual Net Profit</div>
    <div class="hero-kpi-value">${formatCurrency(netProfit)}</div>
    <div class="hero-kpi-sub">Margin: ${profitMargin}%</div>
  </div>
</div>

<div class="body">

<!-- SECTION 1 — MONTH-BY-MONTH PERFORMANCE -->
<div class="section">
  ${sectionHeader('📅', '1. Month-by-Month Performance', '#2563eb')}
  <table>
    <thead><tr>
      ${th('Month')}${th('Production', 'num')}${th('Revenue', 'num')}${th('Expenses', 'num')}${th('Net P/L', 'num')}${th('Margin', 'num')}
    </tr></thead>
    <tbody>
      ${monthRows}
      ${monthTotalRow}
    </tbody>
  </table>
</div>

<!-- SECTION 2 — KEY ANNUAL METRICS -->
<div class="section">
  ${sectionHeader('📊', '2. Key Annual Metrics', '#0891b2')}
  <div class="metrics-grid">
    <div class="metric-tile"><span class="metric-icon">📦</span><div><div class="metric-val">${totalCratesSold.toLocaleString()}</div><div class="metric-lbl">Crates Sold</div></div></div>
    <div class="metric-tile"><span class="metric-icon">🌾</span><div><div class="metric-val">${totalFeedKg} kg</div><div class="metric-lbl">Feed Received</div></div></div>
    <div class="metric-tile"><span class="metric-icon">💸</span><div><div class="metric-val">${formatCurrency(totalFeedCost)}</div><div class="metric-lbl">Feed Cost</div></div></div>
    <div class="metric-tile"><span class="metric-icon">📉</span><div><div class="metric-val">${totalMortality.toLocaleString()} birds</div><div class="metric-lbl">Flock Removed</div></div></div>
    <div class="metric-tile"><span class="metric-icon">💉</span><div><div class="metric-val">${formatCurrency(totalHealthCost)}</div><div class="metric-lbl">Health Cost</div></div></div>
    <div class="metric-tile"><span class="metric-icon">🏆</span><div><div class="metric-val">${activeMonths} / 12</div><div class="metric-lbl">Active Months</div></div></div>
    ${feedStock && feedStock.stockOnHandKg > 0 ? `
    <div class="metric-tile"><span class="metric-icon">🏪</span><div><div class="metric-val">${feedStock.stockOnHandKg.toFixed(1)} kg</div><div class="metric-lbl">Feed on Hand</div></div></div>
    <div class="metric-tile"><span class="metric-icon">📦</span><div><div class="metric-val">${(feedStock.totalPurchasedKg||0).toFixed(1)} kg</div><div class="metric-lbl">Total Purchased</div></div></div>
    ` : ''}
  </div>
</div>

<!-- SECTION 3 — FINANCIAL SUMMARY -->
<div class="section">
  ${sectionHeader('💵', '3. Annual Financial Summary', '#16a34a')}

  <div class="profit-card" style="background:${netProfit >= 0 ? 'linear-gradient(135deg,#f0fdf4,#dcfce7)' : 'linear-gradient(135deg,#fff5f5,#fee2e2)'};border:2px solid ${netProfit >= 0 ? '#22c55e' : '#ef4444'}">
    <div>
      <div class="profit-lbl">${netProfit >= 0 ? '✅ Annual Net Profit' : '❌ Annual Net Loss'} &mdash; ${esc(year)}</div>
      <div class="profit-sub">Revenue ${formatCurrency(grossRevenue)} &minus; Expenses ${formatCurrency(totalExpenses)}</div>
    </div>
    <div>
      <div class="profit-val" style="color:${netProfit >= 0 ? '#16a34a' : '#dc2626'}">${formatCurrency(netProfit)}</div>
      <div class="profit-margin-lbl" style="color:${netProfit >= 0 ? '#22c55e' : '#ef4444'}">${profitMargin}% margin</div>
    </div>
  </div>

  <div class="fin-grid">
    <div class="fin-box">
      <div class="fin-box-hdr">📈 Annual Averages (per active month)</div>
      <div class="fin-row"><span class="fin-lbl">Avg Revenue</span><span class="fin-green">+${formatCurrency(avgMonthlyRevenue)}</span></div>
      <div class="fin-row even"><span class="fin-lbl">Avg Expenses</span><span class="fin-red">−${formatCurrency(avgMonthlyExpenses)}</span></div>
      <div class="fin-row"><span class="fin-lbl">Avg Net Profit</span><span class="${netProfit >= 0 ? 'fin-green' : 'fin-red'}">${formatCurrency((grossRevenue - totalExpenses) / Math.max(activeMonths, 1))}</span></div>
      <div class="fin-row even"><span class="fin-lbl">Active Months</span><span class="fin-val">${activeMonths} / 12</span></div>
      <hr class="fin-divider"/>
      <div class="fin-total"><span>Overall Margin</span><span class="${netProfit >= 0 ? 'fin-green' : 'fin-red'}">${profitMargin}%</span></div>
    </div>
    <div class="fin-box">
      <div class="fin-box-hdr">🏆 Annual Highlights</div>
      <div class="fin-row"><span class="fin-lbl">Total Production</span><span class="fin-val">${formatEggs(totalProduced)}</span></div>
      <div class="fin-row even"><span class="fin-lbl">Total Crates Sold</span><span class="fin-val">${totalCratesSold.toLocaleString()} crates</span></div>
      <div class="fin-row"><span class="fin-lbl">Total Feed Consumed</span><span class="fin-val">${totalFeedKg} kg</span></div>
      <div class="fin-row even"><span class="fin-lbl">Total Flock Removals</span><span class="${totalMortality > 0 ? 'fin-red' : 'fin-val'}">${totalMortality.toLocaleString()} birds</span></div>
      ${bestRevenueMonth ? `<div class="fin-row"><span class="fin-lbl">Best Revenue Month</span><span class="fin-green">${MONTH_LABELS_SHORT[parseInt(bestRevenueMonth.monthYear.slice(5, 7)) - 1]}</span></div>` : ''}
      <hr class="fin-divider"/>
      <div class="fin-total"><span>Total Health Cost</span><span>${formatCurrency(totalHealthCost)}</span></div>
    </div>
  </div>
</div>

<!-- SECTION 4 — PRICING INTELLIGENCE -->
${buildPricingHtml({
  totalExpenses: avgMonthlyExpenses,
  grossRevenue:  avgMonthlyRevenue,
  cratesSold:    activeMonths > 0 ? Math.round(totalCratesSold / activeMonths) : totalCratesSold,
  projectedCrates: activeMonths > 0 ? Math.round(totalCratesSold / activeMonths) : totalCratesSold,
  label: `${year} Annual`,
})}

<!-- SECTION 5 — EXPENSE BREAKDOWN -->
${sortedCats.length > 0 ? `
<div class="section">
  ${sectionHeader('📋', '5. Annual Expense Breakdown by Category', '#dc2626')}
  <div class="stat-grid stat-grid-4">
    ${statCard('Total Expenses', formatCurrency(totalExpenses), `${sortedCats.length} categories`, 'sc-red')}
    ${statCard('Top Category', esc(sortedCats[0]?.[0] || '—'), sortedCats[0] ? formatCurrency(sortedCats[0][1]) : '', 'sc-amber')}
    ${statCard('Feed Cost', formatCurrency(totalFeedCost), 'Annual total', 'sc-amber')}
    ${statCard('Health Cost', formatCurrency(totalHealthCost), 'Annual total', 'sc-purple')}
  </div>
  <div class="cat-bars">${catBars}</div>
</div>
` : ''}

</div><!-- /.body -->

<div class="page-footer">
  <span class="footer-brand">🐔 ${esc(farmName)}${farmLoc ? ` &nbsp;·&nbsp; 📍 ${esc(farmLoc)}` : ''}</span>
  <span>${esc(year)} Annual Report &nbsp;·&nbsp; Generated ${genAt} &nbsp;·&nbsp; Confidential</span>
</div>

</body>
</html>`
}
