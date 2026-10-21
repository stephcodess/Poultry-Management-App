import React, { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useMonth } from '../../utils/MonthContext'
import { useAuth } from '../../utils/AuthContext'
import { formatMonthYear } from '../../utils/format'
import { buildMonthlyReportHtml, buildAnnualReportHtml } from '../../utils/buildReport'
import ReportPreviewModal from '../common/ReportPreviewModal'
import AnnualAnalysisModal from '../common/AnnualAnalysisModal'
import styles from './Header.module.css'

const TITLES = {
  '/dashboard': 'Dashboard',
  '/production': 'Production',
  '/sales': 'Sales',
  '/debtors': 'Debtors',
  '/expenses': 'Expenses',
  '/mortality': 'Flock Movement',
  '/feed': 'Feed Log',
  '/health': 'Health Records',
  '/settings': 'Settings',
  '/users': 'User Management',
  '/activity': 'Activity Log',
  '/profile': 'My Profile',
}


export default function Header() {
  const { pathname } = useLocation()
  const { monthYear, setMonthYear } = useMonth()
  const { session, logout } = useAuth()
  const title = TITLES[pathname] || 'Eldesign Poultry'
  const showMonthPicker = !['/settings', '/users', '/activity', '/profile', '/debtors'].includes(pathname)

  const [showPreview, setShowPreview]         = useState(false)
  const [showAnnual, setShowAnnual]           = useState(false)
  const [exporting, setExporting]             = useState(false)
  const [exportingAnnual, setExportingAnnual] = useState(false)
  const [syncStatus, setSyncStatus]           = useState(null) // 'syncing' | 'ok' | 'error'

  useEffect(() => {
    window.api.sync.onAutoSyncComplete(result => {
      setSyncStatus(result.success ? 'ok' : 'error')
      setTimeout(() => setSyncStatus(null), 4000)
    })
    return () => window.api.sync.offAutoSyncComplete()
  }, [])

  // Monthly PDF export (called from preview modal)
  async function handleMonthlyExport() {
    setExporting(true)
    try {
      const [summary, production, sales, domestic, expenses, health, feed, mortality, settings, feedStock] = await Promise.all([
        window.api.dashboard.getSummary(monthYear),
        window.api.production.getAll(monthYear),
        window.api.sales.getAll(monthYear),
        window.api.domestic.getAll(monthYear),
        window.api.expenses.getAll(monthYear),
        window.api.health.getAll(monthYear),
        window.api.feed.getAll(monthYear),
        window.api.mortality.getAll(monthYear),
        window.api.settings.get(),
        window.api.feed.getStock(),
      ])
      const html = buildMonthlyReportHtml({ summary, production, sales, domestic, expenses, health, feed, mortality, settings, monthYear, feedStock })
      const monthLabel = monthYear.replace('-', '_')
      await window.api.pdf.export({ html, filename: `Eldesign_Poultry_${monthLabel}.pdf` })
    } finally {
      setExporting(false)
    }
  }

  // Annual PDF export (called from annual analysis modal)
  async function handleAnnualExport(year, monthlyData) {
    setExportingAnnual(true)
    try {
      const [settings, feedStock] = await Promise.all([
        window.api.settings.get(),
        window.api.feed.getStock(),
      ])
      const html = buildAnnualReportHtml({ year, monthlyData, settings, feedStock })
      await window.api.pdf.export({ html, filename: `Eldesign_Poultry_Annual_${year}.pdf` })
    } finally {
      setExportingAnnual(false)
    }
  }

  return (
    <>
      <header className={styles.header}>
        <div className={styles.left}>
          <h1 className={styles.title}>{title}</h1>
          {showMonthPicker && (
            <span className={styles.month}>{formatMonthYear(monthYear)}</span>
          )}
        </div>
        <div className={styles.right}>
          {showMonthPicker && (
            <>
              <button
                className={styles.annualBtn}
                onClick={() => setShowAnnual(true)}
                data-tour="annual-btn"
              >
                📊 Year Analysis
              </button>
              <button
                className={styles.exportBtn}
                onClick={() => setShowPreview(true)}
                data-tour="export-btn"
              >
                ⬇ Export PDF
              </button>
              <label className={styles.monthLabel}>Month</label>
              <input
                type="month"
                value={monthYear}
                onChange={e => setMonthYear(e.target.value)}
                className={styles.monthInput}
                data-tour="month-picker"
              />
            </>
          )}
          {syncStatus && (
            <span className={`${styles.syncBadge} ${syncStatus === 'ok' ? styles.syncBadgeOk : styles.syncBadgeErr}`}>
              {syncStatus === 'ok' ? '☁ Synced' : '☁ Sync failed'}
            </span>
          )}
          {session && (
            <button className={styles.logoutBtn} onClick={logout} title="Sign out">
              Sign Out
            </button>
          )}
        </div>
      </header>

      {showPreview && (
        <ReportPreviewModal
          monthYear={monthYear}
          onClose={() => setShowPreview(false)}
          onExportPdf={handleMonthlyExport}
          exporting={exporting}
        />
      )}

      {showAnnual && (
        <AnnualAnalysisModal
          onClose={() => setShowAnnual(false)}
          onExportPdf={handleAnnualExport}
          exporting={exportingAnnual}
        />
      )}
    </>
  )
}
