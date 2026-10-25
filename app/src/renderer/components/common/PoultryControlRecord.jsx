import React, { useState, useEffect, useRef } from 'react'
import Modal from './Modal'
import Button from './Button'
import { buildPoultryControlHtml } from '../../utils/buildPoultryControlReport'
import dayjs from 'dayjs'

const inputStyle = {
  width: '100%',
  border: '1.5px solid #d1d5db',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 15,
  fontFamily: 'var(--font)',
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
  const [rect, setRect] = useState(null)
  const triggerRef = useRef(null)
  const dropRef = useRef(null)

  const allSelected = selected.length === flocks.length || selected.length === 0
  const label = allSelected
    ? 'All Flocks'
    : selected.length === 1
      ? flocks.find(f => f.id === selected[0])?.name
      : `${selected.length} flocks selected`

  function toggle(id) {
    if (selected.includes(id)) onChange(selected.filter(s => s !== id))
    else onChange([...selected, id])
  }

  function toggleAll() {
    if (allSelected) onChange([])
    else onChange(flocks.map(f => f.id))
  }

  function handleOpen() {
    if (!open && triggerRef.current) {
      setRect(triggerRef.current.getBoundingClientRect())
    }
    setOpen(o => !o)
  }

  useEffect(() => {
    function handler(e) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        dropRef.current && !dropRef.current.contains(e.target)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const dropStyle = rect ? {
    position: 'fixed',
    top: rect.top - 6,
    left: rect.left,
    width: rect.width,
    transform: 'translateY(-100%)',
    background: '#fff',
    border: '1.5px solid #e5e7eb',
    borderRadius: 10,
    boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
    zIndex: 9999,
    maxHeight: 220,
    overflowY: 'auto',
  } : {}

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        style={{
          ...inputStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          textAlign: 'left',
          color: '#111827',
        }}
      >
        <span style={{ fontWeight: allSelected ? 400 : 600 }}>{label}</span>
        <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && rect && (
        <div ref={dropRef} style={dropStyle}>
          {/* All Flocks option */}
          <button
            type="button"
            onClick={toggleAll}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '11px 14px',
              background: allSelected ? '#eff6ff' : '#fff',
              border: 'none',
              borderBottom: '1px solid #f3f4f6',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              color: allSelected ? '#2563eb' : '#374151',
              textAlign: 'left',
            }}
          >
            <span style={{
              width: 18, height: 18, borderRadius: 5, border: '2px solid',
              borderColor: allSelected ? '#2563eb' : '#d1d5db',
              background: allSelected ? '#2563eb' : '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, fontSize: 11, color: '#fff',
            }}>
              {allSelected ? '✓' : ''}
            </span>
            All Flocks
          </button>

          {/* Individual flocks */}
          {flocks.map(fk => {
            const checked = selected.includes(fk.id)
            return (
              <button
                key={fk.id}
                type="button"
                onClick={() => toggle(fk.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '11px 14px',
                  background: checked ? '#eff6ff' : '#fff',
                  border: 'none',
                  borderBottom: '1px solid #f3f4f6',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: checked ? 600 : 400,
                  color: checked ? '#2563eb' : '#374151',
                  textAlign: 'left',
                }}
              >
                <span style={{
                  width: 18, height: 18, borderRadius: 5, border: '2px solid',
                  borderColor: checked ? '#2563eb' : '#d1d5db',
                  background: checked ? '#2563eb' : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, fontSize: 11, color: '#fff',
                }}>
                  {checked ? '✓' : ''}
                </span>
                {fk.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function PoultryControlRecord({ onClose }) {
  const today = dayjs()
  const [from, setFrom] = useState(today.startOf('month').format('YYYY-MM-DD'))
  const [to, setTo]     = useState(today.format('YYYY-MM-DD'))
  const [flocks, setFlocks]           = useState([])
  const [selectedFlocks, setSelectedFlocks] = useState([]) // empty = all
  const [loading, setLoading]     = useState(false)
  const [exporting, setExporting] = useState(false)
  const [reportData, setReportData] = useState(null)
  const [previewHtml, setPreviewHtml] = useState(null)
  const iframeRef = useRef(null)

  useEffect(() => {
    window.api.flocks.getAll().then(f => setFlocks((f || []).filter(fk => fk.is_active)))
  }, [])

  async function generatePreview() {
    if (!from || !to || from > to) return
    setLoading(true)
    try {
      const [data, settings] = await Promise.all([
        window.api.report.poultryControl({ from, to }),
        window.api.settings.get(),
      ])
      const filteredFlocks = selectedFlocks.length === 0
        ? data.flocks
        : data.flocks.filter(f => selectedFlocks.includes(f.id))

      const filtered = { ...data, flocks: filteredFlocks, from, to, settings }
      setReportData(filtered)
      setPreviewHtml(buildPoultryControlHtml(filtered))
    } finally {
      setLoading(false)
    }
  }

  async function handleDownload() {
    if (!reportData) return
    setExporting(true)
    try {
      const html = buildPoultryControlHtml(reportData)
      const flockLabel = selectedFlocks.length === 0
        ? 'All_Flocks'
        : flocks.filter(f => selectedFlocks.includes(f.id)).map(f => f.name).join('_')
      await window.api.pdf.export({ html, filename: `Poultry_Control_Record_${from}_to_${to}_${flockLabel}.pdf` })
    } finally {
      setExporting(false)
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

  const dayCount = from && to && from <= to ? dayjs(to).diff(dayjs(from), 'day') + 1 : 0
  const flockSummary = selectedFlocks.length === 0 ? 'All Flocks' :
    selectedFlocks.length === 1 ? flocks.find(f => f.id === selectedFlocks[0])?.name :
    `${selectedFlocks.length} flocks`

  return (
    <Modal
      title="Poultry Control Record"
      onClose={onClose}
      maxWidth={previewHtml ? 1100 : 580}
      footer={
        previewHtml ? (
          <>
            <Button variant="secondary" onClick={() => setPreviewHtml(null)}>← Back</Button>
            <Button onClick={handleDownload} disabled={exporting}>
              {exporting ? 'Saving…' : '⬇ Download PDF'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={generatePreview} disabled={loading || !from || !to || from > to}>
              {loading ? 'Generating…' : 'Preview Report →'}
            </Button>
          </>
        )
      }
    >
      {!previewHtml ? (
        <div style={{ padding: '4px 0 8px' }}>
          <p style={{ margin: '0 0 24px', color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
            Select a date range and flocks to generate the Poultry Control Record.
          </p>

          {/* Date range + flock in a 3-col grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div>
              <label style={labelStyle}>From</label>
              <input type="date" value={from} max={to}
                onChange={e => setFrom(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>To</label>
              <input type="date" value={to} min={from} max={today.format('YYYY-MM-DD')}
                onChange={e => setTo(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Flocks</label>
              <FlockDropdown
                flocks={flocks}
                selected={selectedFlocks}
                onChange={setSelectedFlocks}
              />
            </div>
          </div>

          {/* Validation / summary */}
          {from && to && from > to && (
            <p style={{ color: '#dc2626', fontSize: 13 }}>⚠ "From" date must be before "To" date.</p>
          )}
          {dayCount > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#f8fafc', border: '1px solid #e2e8f0',
              borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#64748b',
            }}>
              <span>📅 <strong>{dayCount}</strong> day{dayCount !== 1 ? 's' : ''}</span>
              <span style={{ color: '#cbd5e1' }}>·</span>
              <span>🐔 <strong>{flockSummary}</strong></span>
            </div>
          )}
        </div>
      ) : (
        <div style={{ height: '78vh', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          <iframe
            ref={iframeRef}
            title="Poultry Control Record Preview"
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        </div>
      )}
    </Modal>
  )
}
