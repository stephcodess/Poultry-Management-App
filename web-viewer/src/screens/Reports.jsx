import React, { useState, useEffect, useRef } from 'react'
import dayjs from 'dayjs'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { supabase } from '../supabaseClient'
import { buildPoultryControlHtml } from '../utils/buildPoultryControlReport'
import { buildMonthlyReportHtml, buildAnnualReportHtml } from '../utils/buildReport'
import { useMonth } from '../utils/MonthContext'
import Button from '../components/common/Button'
import s from './Screen.module.css'

// ─── Shared styles ────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%', border: '1.5px solid #d1d5db', borderRadius: 8,
  padding: '10px 12px', fontSize: 15, fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box', background: '#fff',
}
const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }

// ─── Flock multi-select dropdown ──────────────────────────────────────────────
function FlockDropdown({ flocks, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const allSelected = selected.length === 0 || selected.length === flocks.length
  const label = allSelected ? 'All Flocks'
    : selected.length === 1 ? flocks.find(f => f.id === selected[0])?.name
    : `${selected.length} flocks selected`

  function toggle(id) {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  }

  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ ...inputStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
        <span style={{ fontWeight: allSelected ? 400 : 600 }}>{label}</span>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 10, boxShadow: '0 4px 24px rgba(0,0,0,0.12)', zIndex: 9999, maxHeight: 220, overflowY: 'auto' }}>
          <button type="button" onClick={() => onChange([])} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: allSelected ? '#eff6ff' : '#fff', border: 'none', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: allSelected ? '#2563eb' : '#374151', textAlign: 'left' }}>
            <Checkbox checked={allSelected} /> All Flocks
          </button>
          {flocks.map(fk => {
            const checked = selected.includes(fk.id)
            return (
              <button key={fk.id} type="button" onClick={() => toggle(fk.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: checked ? '#eff6ff' : '#fff', border: 'none', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', fontSize: 14, fontWeight: checked ? 600 : 400, color: checked ? '#2563eb' : '#374151', textAlign: 'left' }}>
                <Checkbox checked={checked} /> {fk.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Checkbox({ checked }) {
  return (
    <span style={{ width: 18, height: 18, borderRadius: 5, border: '2px solid', borderColor: checked ? '#2563eb' : '#d1d5db', background: checked ? '#2563eb' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, color: '#fff' }}>
      {checked ? '✓' : ''}
    </span>
  )
}

// ─── PDF download via jsPDF + html2canvas ─────────────────────────────────────
async function downloadAsPdf(html, filename, onError) {
  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;font-family:Arial,sans-serif;'
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  container.innerHTML = bodyMatch ? bodyMatch[1] : html
  document.body.appendChild(container)

  try {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageWidth  = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 14

    // Split on page-break divs if present, otherwise render whole container
    const pages = container.querySelectorAll('div[style*="page-break-after"]')
    const items = pages.length > 0 ? Array.from(pages) : [container]

    for (let i = 0; i < items.length; i++) {
      if (i > 0) pdf.addPage()
      const canvas = await html2canvas(items[i], { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: 794 })
      const imgData = canvas.toDataURL('image/jpeg', 0.95)
      const canvasWidthMm  = pageWidth - margin * 2
      const canvasHeightMm = (canvas.height / canvas.width) * canvasWidthMm
      const usedHeight = Math.min(canvasHeightMm, pageHeight - margin * 2)
      pdf.addImage(imgData, 'JPEG', margin, margin, canvasWidthMm, usedHeight)
    }

    pdf.save(filename)
  } catch (err) {
    onError('PDF generation failed: ' + err.message)
  } finally {
    document.body.removeChild(container)
  }
}

// ─── Shared preview + download panel ─────────────────────────────────────────
function PreviewPanel({ html, filename, onBack }) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState(null)
  const iframeRef = useRef(null)

  useEffect(() => {
    if (html && iframeRef.current) {
      const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow.document
      doc.open(); doc.write(html); doc.close()
    }
  }, [html])

  async function handleDownload() {
    setDownloading(true); setError(null)
    await downloadAsPdf(html, filename, setError)
    setDownloading(false)
  }

  function handlePrint() {
    if (!iframeRef.current) return
    iframeRef.current.contentWindow.focus()
    iframeRef.current.contentWindow.print()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '0 24px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <Button variant="secondary" onClick={onBack}>← Back</Button>
        <Button onClick={handleDownload} disabled={downloading}>
          {downloading ? 'Generating PDF…' : '⬇ Download PDF'}
        </Button>
        <button type="button" onClick={handlePrint}
          style={{ fontSize: 13, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 4px', textDecoration: 'underline' }}>
          🖨 Print instead
        </button>
        {error && <span style={{ fontSize: 13, color: '#dc2626' }}>⚠ {error}</span>}
      </div>
      <div style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', minHeight: '75vh' }}>
        <iframe ref={iframeRef} title="Report Preview" style={{ width: '100%', height: '100%', border: 'none', minHeight: '75vh' }} />
      </div>
    </div>
  )
}

// ─── Monthly Analysis ─────────────────────────────────────────────────────────
function MonthlyReport() {
  const { monthYear } = useMonth()
  const [loading, setLoading] = useState(false)
  const [previewHtml, setPreviewHtml] = useState(null)

  async function generate() {
    setLoading(true)
    try {
      const [
        { data: summarySettings },
        { data: production },
        { data: sales },
        { data: domestic },
        { data: expenses },
        { data: health },
        { data: feed },
        { data: mortality },
        { data: settingsRaw },
        { data: allFeed },
      ] = await Promise.all([
        supabase.from('app_settings').select('key, value'),
        supabase.from('production').select('*, flocks(name, color)').eq('month_year', monthYear).order('date'),
        supabase.from('sales').select('*, flocks(name, color)').eq('month_year', monthYear).order('date'),
        supabase.from('domestic_usage').select('*, flocks(name, color)').eq('month_year', monthYear).order('date'),
        supabase.from('expenses').select('*').eq('month_year', monthYear).order('date'),
        supabase.from('health_records').select('*, flocks(name, color)').eq('month_year', monthYear).order('date'),
        supabase.from('feed_log').select('*, flocks(name, color)').eq('month_year', monthYear).order('date'),
        supabase.from('flock_movements').select('*, flocks(name, color)').eq('month_year', monthYear).order('date'),
        supabase.from('app_settings').select('key, value'),
        supabase.from('feed_log').select('quantity_kg, total_cost'),
      ])

      const settings = Object.fromEntries((settingsRaw || []).map(r => [r.key, r.value]))

      // Flatten joined flock data
      const flatProd = (production || []).map(r => ({ ...r, flock_name: r.flocks?.name }))
      const flatSales = (sales || []).map(r => ({ ...r, flock_name: r.flocks?.name }))
      const flatDom = (domestic || []).map(r => ({ ...r, flock_name: r.flocks?.name }))
      const flatHealth = (health || []).map(r => ({ ...r, flock_name: r.flocks?.name }))
      const flatFeed = (feed || []).map(r => ({ ...r, flock_name: r.flocks?.name }))
      const flatMort = (mortality || []).map(r => ({ ...r, flock_name: r.flocks?.name }))

      // Build summary object matching what buildMonthlyReportHtml expects
      const totalProduced = flatProd.reduce((s, r) => s + (r.total_eggs || 0), 0)
      const grossRevenue  = flatSales.reduce((s, r) => s + (r.total_revenue || 0), 0)
      const totalExpenses = (expenses || []).reduce((s, r) => s + (r.amount || 0), 0)
      const openingBalance = 0 // not available in web viewer easily

      // Closing stock: opening stock + produced - sold - domestic
      const totalSoldEggs = flatSales.reduce((s, r) => s + (r.crates || 0) * 30 + (r.pieces || 0), 0)
      const totalDomEggs  = flatDom.reduce((s, r) => s + (r.crates || 0) * 30 + (r.pieces || 0), 0)
      const closingStockEggs = Math.max(totalProduced - totalSoldEggs - totalDomEggs, 0)
      const closingStockCrates = Math.floor(closingStockEggs / 30)
      const closingStockPieces = closingStockEggs % 30

      // Best selling size
      const sizeRev = {}
      flatSales.forEach(r => { sizeRev[r.egg_size] = (sizeRev[r.egg_size] || 0) + (r.total_revenue || 0) })
      const bestSellingSize = Object.entries(sizeRev).sort(([,a],[,b]) => b - a)[0]?.[0] || '—'
      const totalCrates = flatSales.reduce((s, r) => s + (r.crates || 0), 0)
      const avgCratePrice = totalCrates > 0 ? grossRevenue / totalCrates : 0

      const summary = {
        opening: { totalEggs: 0 },
        totalProduced, closingStockCrates, closingStockPieces,
        grossRevenue, openingBalance,
        totalExpenses, closingBalance: openingBalance + grossRevenue - totalExpenses,
        bestSellingSize, avgCratePrice,
      }

      // Feed stock
      const totalPurchasedKg = (allFeed || []).reduce((s, r) => s + (r.quantity_kg || 0), 0)
      const totalConsumedKg  = flatFeed.reduce((s, r) => s + (r.quantity_kg || 0), 0)
      const feedStock = { totalPurchasedKg, totalConsumedKg, stockOnHandKg: Math.max(totalPurchasedKg - totalConsumedKg, 0) }

      const html = buildMonthlyReportHtml({
        summary, production: flatProd, sales: flatSales, domestic: flatDom,
        expenses: expenses || [], health: flatHealth, feed: flatFeed,
        mortality: flatMort, settings, monthYear, feedStock,
      })
      setPreviewHtml(html)
    } finally {
      setLoading(false)
    }
  }

  if (previewHtml) {
    return <PreviewPanel html={previewHtml} filename={`Eldesign_Poultry_${monthYear}.pdf`} onBack={() => setPreviewHtml(null)} />
  }

  return (
    <div style={{ padding: '16px 24px', maxWidth: 600 }}>
      <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
        Generates a full monthly farm report for <strong>{dayjs(monthYear + '-01').format('MMMM YYYY')}</strong> — production, sales, expenses, feed, health, mortality, and pricing intelligence.
      </p>
      <Button onClick={generate} disabled={loading}>
        {loading ? 'Generating…' : 'Preview Monthly Report →'}
      </Button>
    </div>
  )
}

// ─── Annual Analysis ──────────────────────────────────────────────────────────
function AnnualReport() {
  const { monthYear } = useMonth()
  const currentYear = monthYear.slice(0, 4)
  const [year, setYear] = useState(currentYear)
  const [loading, setLoading] = useState(false)
  const [previewHtml, setPreviewHtml] = useState(null)
  const [activeMonths, setActiveMonths] = useState(0)

  const yearOptions = Array.from({ length: 5 }, (_, i) => String(Number(currentYear) - i))

  async function generate() {
    setLoading(true)
    try {
      const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)

      const [monthlyResults, settingsResult, allFeedResult] = await Promise.all([
        Promise.all(months.map(my => Promise.all([
          supabase.from('production').select('*, flocks(name,color)').eq('month_year', my),
          supabase.from('sales').select('*, flocks(name,color)').eq('month_year', my),
          supabase.from('domestic_usage').select('*, flocks(name,color)').eq('month_year', my),
          supabase.from('expenses').select('*').eq('month_year', my),
          supabase.from('health_records').select('*, flocks(name,color)').eq('month_year', my),
          supabase.from('feed_log').select('*, flocks(name,color)').eq('month_year', my),
          supabase.from('flock_movements').select('*, flocks(name,color)').eq('month_year', my),
        ]))),
        supabase.from('app_settings').select('key, value'),
        supabase.from('feed_log').select('quantity_kg, total_cost'),
      ])

      const settings = Object.fromEntries((settingsResult.data || []).map(r => [r.key, r.value]))

      const monthlyData = months.map((my, i) => {
        const [prod, sal, dom, exp, hlth, feedData, mort] = monthlyResults[i]
        const flatProd  = (prod.data  || []).map(r => ({ ...r, flock_name: r.flocks?.name }))
        const flatSales = (sal.data   || []).map(r => ({ ...r, flock_name: r.flocks?.name }))
        const flatDom   = (dom.data   || []).map(r => ({ ...r, flock_name: r.flocks?.name }))
        const flatHlth  = (hlth.data  || []).map(r => ({ ...r, flock_name: r.flocks?.name }))
        const flatFeed  = (feedData.data || []).map(r => ({ ...r, flock_name: r.flocks?.name }))
        const flatMort  = (mort.data  || []).map(r => ({ ...r, flock_name: r.flocks?.name }))

        const totalProduced = flatProd.reduce((s, r) => s + (r.total_eggs || 0), 0)
        const grossRevenue  = flatSales.reduce((s, r) => s + (r.total_revenue || 0), 0)
        const totalExpenses = (exp.data || []).reduce((s, r) => s + (r.amount || 0), 0)

        return {
          monthYear: my,
          summary: { totalProduced, grossRevenue, totalExpenses, closingBalance: grossRevenue - totalExpenses },
          production: flatProd, sales: flatSales, domestic: flatDom,
          expenses: exp.data || [], health: flatHlth, feed: flatFeed, mortality: flatMort,
        }
      })

      const active = monthlyData.filter(d => d.summary.totalProduced > 0 || d.summary.grossRevenue > 0).length
      setActiveMonths(active)

      const totalPurchasedKg = (allFeedResult.data || []).reduce((s, r) => s + (r.quantity_kg || 0), 0)
      const totalConsumedKg  = monthlyData.reduce((s, d) => s + d.feed.reduce((ss, r) => ss + (r.quantity_kg || 0), 0), 0)
      const feedStock = { totalPurchasedKg, totalConsumedKg, stockOnHandKg: Math.max(totalPurchasedKg - totalConsumedKg, 0) }

      const html = buildAnnualReportHtml({ year, monthlyData, settings, feedStock })
      setPreviewHtml(html)
    } finally {
      setLoading(false)
    }
  }

  if (previewHtml) {
    return <PreviewPanel html={previewHtml} filename={`Eldesign_Poultry_Annual_${year}.pdf`} onBack={() => setPreviewHtml(null)} />
  }

  return (
    <div style={{ padding: '16px 24px', maxWidth: 600 }}>
      <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
        Generates a full-year analysis — month-by-month breakdown, annual totals, pricing intelligence, and expense analysis.
      </p>
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Year</label>
        <select value={year} onChange={e => setYear(e.target.value)} style={{ ...inputStyle, width: 160 }}>
          {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <Button onClick={generate} disabled={loading}>
        {loading ? 'Loading 12 months…' : 'Preview Annual Report →'}
      </Button>
    </div>
  )
}

// ─── Poultry Control Record ───────────────────────────────────────────────────
function ControlRecord() {
  const today = dayjs()
  const [from, setFrom] = useState(today.startOf('month').format('YYYY-MM-DD'))
  const [to, setTo] = useState(today.format('YYYY-MM-DD'))
  const [flocks, setFlocks] = useState([])
  const [selectedFlocks, setSelectedFlocks] = useState([])
  const [loading, setLoading] = useState(false)
  const [previewHtml, setPreviewHtml] = useState(null)
  const [reportFilename, setReportFilename] = useState('report.pdf')

  useEffect(() => {
    supabase.from('flocks').select('*').eq('is_active', 1).order('sort_order').then(({ data }) => setFlocks(data || []))
  }, [])

  async function generate() {
    if (!from || !to || from > to) return
    setLoading(true)
    try {
      const [
        { data: flocksData },
        { data: mortalityBefore },
        { data: mortality },
        { data: feed },
        { data: water },
        { data: healthRaw },
        { data: settingsRaw },
      ] = await Promise.all([
        supabase.from('flocks').select('*').eq('is_active', 1).order('sort_order'),
        supabase.from('flock_movements').select('flock_id, count').lt('date', from),
        supabase.from('flock_movements').select('date, flock_id, count').gte('date', from).lte('date', to),
        supabase.from('feed_log').select('date, flock_id, quantity_kg').gte('date', from).lte('date', to),
        supabase.from('water_log').select('date, flock_id, litres').gte('date', from).lte('date', to),
        supabase.from('health_records').select('date, flock_id, name, record_type').gte('date', from).lte('date', to),
        supabase.from('app_settings').select('key, value'),
      ])

      const mortalityBeforeMap = {}
      ;(mortalityBefore || []).forEach(r => {
        mortalityBeforeMap[r.flock_id] = (mortalityBeforeMap[r.flock_id] || 0) + (r.count || 0)
      })

      const healthGrouped = {}
      ;(healthRaw || []).forEach(r => {
        const key = `${r.date}__${r.flock_id ?? 'all'}`
        const label = r.name || r.record_type || ''
        healthGrouped[key] = healthGrouped[key] ? healthGrouped[key] + ', ' + label : label
      })
      const health = Object.entries(healthGrouped).map(([key, treatments]) => {
        const [date, flock_id] = key.split('__')
        return { date, flock_id: flock_id === 'all' ? null : Number(flock_id), treatments }
      })

      const settings = Object.fromEntries((settingsRaw || []).map(r => [r.key, r.value]))
      const allFlocks = flocksData || []
      const filteredFlocks = selectedFlocks.length === 0 ? allFlocks : allFlocks.filter(f => selectedFlocks.includes(f.id))

      const flockLabel = selectedFlocks.length === 0 ? 'All_Flocks' : filteredFlocks.map(f => f.name.replace(/\s+/g, '_')).join('_')
      setReportFilename(`Poultry_Control_Record_${from}_to_${to}_${flockLabel}.pdf`)

      setPreviewHtml(buildPoultryControlHtml({
        flocks: filteredFlocks, mortalityBeforeMap,
        mortality: mortality || [], feed: feed || [], water: water || [], health,
        from, to, settings,
      }))
    } finally {
      setLoading(false)
    }
  }

  const dayCount = from && to && from <= to ? dayjs(to).diff(dayjs(from), 'day') + 1 : 0
  const flockSummary = selectedFlocks.length === 0 ? 'All Flocks'
    : selectedFlocks.length === 1 ? flocks.find(f => f.id === selectedFlocks[0])?.name
    : `${selectedFlocks.length} flocks`

  if (previewHtml) {
    return <PreviewPanel html={previewHtml} filename={reportFilename} onBack={() => setPreviewHtml(null)} />
  }

  return (
    <div style={{ padding: '16px 24px', maxWidth: 700 }}>
      <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
        Daily bird count, mortality, feed, water, and health treatments per flock — one A4 page per flock.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div>
          <label style={labelStyle}>From</label>
          <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>To</label>
          <input type="date" value={to} min={from} max={today.format('YYYY-MM-DD')} onChange={e => setTo(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Flocks</label>
          <FlockDropdown flocks={flocks} selected={selectedFlocks} onChange={setSelectedFlocks} />
        </div>
      </div>
      {from && to && from > to && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>⚠ "From" date must be before "To" date.</p>}
      {dayCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#64748b', marginBottom: 20 }}>
          <span>📅 <strong>{dayCount}</strong> day{dayCount !== 1 ? 's' : ''}</span>
          <span style={{ color: '#cbd5e1' }}>·</span>
          <span>🐔 <strong>{flockSummary}</strong></span>
        </div>
      )}
      <Button onClick={generate} disabled={loading || !from || !to || from > to}>
        {loading ? 'Generating…' : 'Preview Report →'}
      </Button>
    </div>
  )
}

// ─── Main Reports screen ──────────────────────────────────────────────────────
const TABS = [
  { id: 'monthly',  label: '📈 Monthly Analysis' },
  { id: 'annual',   label: '📊 Year Analysis' },
  { id: 'control',  label: '📋 Control Record' },
]

export default function Reports() {
  const [tab, setTab] = useState('monthly')

  return (
    <div className={s.page}>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e7eb', padding: '0 24px', background: '#fff', flexShrink: 0 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              padding: '14px 20px', fontSize: 14, fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? '#2563eb' : '#64748b',
              background: 'none', border: 'none', borderBottom: tab === t.id ? '2px solid #2563eb' : '2px solid transparent',
              cursor: 'pointer', marginBottom: -1, transition: 'color 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'monthly' && <MonthlyReport />}
      {tab === 'annual'  && <AnnualReport />}
      {tab === 'control' && <ControlRecord />}
    </div>
  )
}
