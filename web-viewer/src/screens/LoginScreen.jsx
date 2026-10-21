import React, { useState } from 'react'
import { useAuth } from '../utils/AuthContext'
import styles from './LoginScreen.module.css'

function BrandPanel() {
  return (
    <div className={styles.panel}>
      <div className={styles.panelGlowGreen} />
      <div className={styles.panelGlowPurple} />
      <div className={styles.panelShimmer} />

      <div className={styles.panelTopBar}>
        <div className={styles.panelTopLogo}>🐔</div>
        <div>
          <div className={styles.panelTopName}>Eldesign Poultry Farm</div>
          <div className={styles.panelTopSub}>Farm Management System</div>
        </div>
      </div>

      <div className={styles.panelMetrics}>
        <div className={styles.panelMetric}>
          <div className={`${styles.panelMetricIcon} ${styles.blue}`}>🥚</div>
          <div className={styles.panelMetricBody}>
            <div className={styles.panelMetricValue}>Daily Tracking</div>
            <div className={styles.panelMetricLabel}>Production & yield logs</div>
          </div>
        </div>
        <div className={styles.panelMetric}>
          <div className={`${styles.panelMetricIcon} ${styles.green}`}>💰</div>
          <div className={styles.panelMetricBody}>
            <div className={styles.panelMetricValue}>Revenue Analytics</div>
            <div className={styles.panelMetricLabel}>Sales, wallet & cash flow</div>
          </div>
        </div>
        <div className={styles.panelMetric}>
          <div className={`${styles.panelMetricIcon} ${styles.amber}`}>📄</div>
          <div className={styles.panelMetricBody}>
            <div className={styles.panelMetricValue}>PDF Reports</div>
            <div className={styles.panelMetricLabel}>Government-ready exports</div>
          </div>
        </div>
      </div>

      <div className={styles.panelCenter}>
        <div className={styles.panelMascotRing}>🐔</div>
        <div className={styles.panelMascotTag}>Smart Poultry Management</div>
      </div>

      <div className={styles.panelBottom}>
        <div className={styles.panelHeadline}>
          Your Farm.<br />
          <span className={styles.panelHeadlineAccent}>Fully in Control.</span>
        </div>
        <div className={styles.panelTagline}>
          Everything you need to run a modern poultry operation — from daily egg counts to government-grade monthly reports.
        </div>
        <div className={styles.panelPills}>
          {[
            ['🥚', 'Production'],
            ['💰', 'Sales & Revenue'],
            ['📋', 'Expenses'],
            ['💉', 'Health Records'],
            ['📊', 'PDF Reports'],
            ['👥', 'Team Access'],
          ].map(([icon, label]) => (
            <div key={label} className={styles.panelPill}>
              <div className={styles.panelPillDot} />
              {icon} {label}
            </div>
          ))}
        </div>
        <div className={styles.panelDivider} />
        <div className={styles.panelFootNote}>
          ☁ <span>Cloud-synced farm data.</span> View your records from anywhere.
        </div>
      </div>
    </div>
  )
}

export default function LoginScreen() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await login(email, password)
    setLoading(false)
    if (result.error) setError(result.error)
  }

  return (
    <div className={styles.shell}>
      <BrandPanel />

      <div className={styles.formSide}>
        <div className={styles.formSideTop}>
          <span className={styles.formSideVersion}>Web Viewer</span>
        </div>
        <div className={styles.formInner}>
          <div className={styles.formTitle}>Sign in</div>
          <div className={styles.formSubtitle}>Enter your credentials to access the farm dashboard.</div>

          <form onSubmit={handleSubmit} className={styles.form}>
            {error && <div className={styles.error}>⚠ {error}</div>}
            <div className={styles.field}>
              <label className={styles.label}>Email address</label>
              <input
                className={styles.input}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Password</label>
              <input
                className={styles.input}
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <button className={styles.btn} type="submit" disabled={loading}>
              {loading ? <span className={styles.spinner} /> : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
