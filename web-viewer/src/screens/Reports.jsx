import React, { useState, useEffect, useRef } from 'react'
import dayjs from 'dayjs'
import { supabase } from '../supabaseClient'
import { buildPoultryControlHtml } from '../utils/buildPoultryControlReport'
import Button from '../components/common/Button'
import s from './Screen.module.css'

const inputStyle = {
  width: '100%',
  border: '1.5px solid #d1d5db',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 15,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
  background: '#fff',
}

const labelStyle = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#374151',
  marginBottom: 6,
}

function FlockDropdown({ flocks, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const allSelected = selected.length === 0 || selected.length === flocks.length
  const label = allSelected
    ? 'All Flocks'
    : selected.length === 1
      ? flocks.find(f => f.id === selected[0])?.name
      : `${selected.length} flocks selected`

  function toggle(id) {
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id])
  }

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ ...inputStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
        <span style={{ fontWeight: allSelected ? 400 : 600 }}>{label}</span>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 10, boxShadow: '0 4px 24px rgba(0,0,0,0.12)', zIndex: 9999, maxHeight: 220, overflowY: 'auto' }}>
          <button type="button" onClick={() => onChange([])} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: allSelected ? '#eff6ff' : '#fff', border: 'none', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: allSelected ? '#2563eb' : '#374151', textAlign: 'left' }}>
            <span style={{ width: 18, height: 18, borderRadius: 5, border: '2px solid', borderColor: allSelected ? '#2563eb' : '#d1d5db', background: allSelected ? '#2563eb' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, color: '#fff' }}>{allSelected ? '✓' : ''}</span>
            All Flocks
          </button>
          {flocks.map(fk => {
            const checked = selected.includes(fk.id)
            return (
              <button key={fk.id} type="button" onClick={() => toggle(fk.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: checked ? '#eff6ff' : '#fff', border: 'none', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', fontSize: 14, fontWeight: checked ? 600 : 400, color: checked ? '#2563eb' : '#374151', textAlign: 'left' }}>
                <span style={{ width: 18, height: 18, borderRadius: 5, border: '2px solid', borderColor: checked ? '#2563eb' : '#d1d5db', background: checked ? '#2563eb' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, color: '#fff' }}>{checked ? '✓' : ''}</span>
                {fk.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Reports() {
  const today = dayjs()
  const [from, setFrom] = useState(today.startOf('month').format('YYYY-MM-DD'))
  const [to, setTo] = useState(today.format('YYYY-MM-DD'))
  const [flocks, setFlocks] = useState([])
  const [selectedFlocks, setSelectedFlocks] = useState([])
  const [loading, setLoading] = useState(false)
  const [previewHtml, setPreviewHtml] = useState(null)
  const iframeRef = useRef(null)

  useEffect(() => {
    supabase.from('flocks').select('*').eq('is_active', 1).order('sort_order').then(({ data }) => setFlocks(data || []))
  }, [])

  async function generatePreview() {
    if (!from || !to || from > to) return
    setLoading(true)
    try {
      const fromMonthYear = from.slice(0, 7)
      const toMonthYear = to.slice(0, 7)

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

      // Build mortalityBeforeMap: total removed per flock before start date
      const mortalityBeforeMap = {}
      ;(mortalityBefore || []).forEach(r => {
        mortalityBeforeMap[r.flock_id] = (mortalityBeforeMap[r.flock_id] || 0) + (r.count || 0)
      })

      // Build health treatments string per date per flock
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
      const filteredFlocks = selectedFlocks.length === 0
        ? allFlocks
        : allFlocks.filter(f => selectedFlocks.includes(f.id))

      const html = buildPoultryControlHtml({
        flocks: filteredFlocks,
        mortalityBeforeMap,
        mortality: mortality || [],
        feed: feed || [],
        water: water || [],
        health,
        from,
        to,
        settings,
      })
      setPreviewHtml(html)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (previewHtml && iframeRef.current) {
      const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow.document
      doc.open()
      doc.write(previewHtml)
      doc.close()
    }
  }, [previewHtml])

  function handlePrint() {
    if (!iframeRef.current) return
    iframeRef.current.contentWindow.focus()
    iframeRef.current.contentWindow.print()
  }

  const dayCount = from && to && from <= to ? dayjs(to).diff(dayjs(from), 'day') + 1 : 0
  const flockSummary = selectedFlocks.length === 0 ? 'All Flocks'
    : selectedFlocks.length === 1 ? flocks.find(f => f.id === selectedFlocks[0])?.name
    : `${selectedFlocks.length} flocks`

  return (
    <div className={s.page}>
      <div className={s.sectionTitle}>Poultry Control Record</div>

      {!previewHtml ? (
        <div style={{ padding: '16px 24px', maxWidth: 700 }}>
          <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
            Select a date range and flocks to generate the Poultry Control Record. You can then print it or save as PDF using your browser's print dialog.
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

          {from && to && from > to && (
            <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>⚠ "From" date must be before "To" date.</p>
          )}

          {dayCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#64748b', marginBottom: 20 }}>
              <span>📅 <strong>{dayCount}</strong> day{dayCount !== 1 ? 's' : ''}</span>
              <span style={{ color: '#cbd5e1' }}>·</span>
              <span>🐔 <strong>{flockSummary}</strong></span>
            </div>
          )}

          <Button onClick={generatePreview} disabled={loading || !from || !to || from > to}>
            {loading ? 'Generating…' : 'Preview Report →'}
          </Button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '0 24px 24px' }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <Button variant="secondary" onClick={() => setPreviewHtml(null)}>← Back</Button>
            <Button onClick={handlePrint}>🖨 Print / Save as PDF</Button>
          </div>
          <div style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', minHeight: '75vh' }}>
            <iframe
              ref={iframeRef}
              title="Poultry Control Record Preview"
              style={{ width: '100%', height: '100%', border: 'none', minHeight: '75vh' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
