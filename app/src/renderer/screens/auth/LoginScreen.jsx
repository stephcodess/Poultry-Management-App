import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../utils/AuthContext'
import styles from './LoginScreen.module.css'
import chickenLogo from '../../assets/chicken-logo.jpg'

// ── Decorative left panel ──────────────────────────────────────────────────────
function BrandPanel() {
  return (
    <div className={styles.panel}>
      {/* Layered glow accents */}
      <div className={styles.panelGlowGreen} />
      <div className={styles.panelGlowPurple} />
      <div className={styles.panelShimmer} />

      {/* Top-left logo bar */}
      <div className={styles.panelTopBar}>
        <img src={chickenLogo} alt="logo" className={styles.panelTopLogoImg} />
        <div>
          <div className={styles.panelTopName}>Eldesign Poultry Farm</div>
          <div className={styles.panelTopSub}>Farm Management System</div>
        </div>
      </div>

      {/* Floating metric cards — top right */}
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

      {/* Centre mascot */}
      <div className={styles.panelCenter}>
        <img src={chickenLogo} alt="Eldesign Poultry" className={styles.panelMascotImg} />
        <div className={styles.panelMascotTag}>Smart Poultry Management</div>
      </div>

      {/* Bottom brand + feature pills */}
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
          🔒 <span>Your data stays on your device.</span> Offline-first, private by default.
        </div>
      </div>
    </div>
  )
}

// ── Onboarding flow (first run) ────────────────────────────────────────────────
const OB_STEPS = ['Welcome', 'Farm Details', 'Your Flock', 'Done']

function OnboardingFlow({ onComplete }) {
  const [step, setStep]           = useState(0) // 0..3
  const [farmName, setFarmName]   = useState('Eldesign Poultry Farm')
  const [farmLoc, setFarmLoc]     = useState('Osogbo, Osun State, Nigeria')
  const [flockSize, setFlockSize] = useState('')
  const [loading, setLoading]     = useState(false)

  const FLOCK_OPTIONS = [
    { label: '1–50', value: '1-50' },
    { label: '51–100', value: '51-100' },
    { label: '101–300', value: '101-300' },
    { label: '301–500', value: '301-500' },
    { label: '501–1000', value: '501-1000' },
    { label: '1000+', value: '1000+' },
  ]

  async function finish() {
    setLoading(true)
    await window.api.settings.update({
      farm_name: farmName.trim() || 'Eldesign Poultry Farm',
      farm_location: farmLoc.trim(),
      sync_mode: 'cloud',
      flock_size_range: flockSize,
      onboarding_complete: '1',
    })
    setLoading(false)
    onComplete()
  }

  const progress = (
    <div className={styles.obProgress}>
      {OB_STEPS.map((_, i) => (
        <div key={i} className={`${styles.obStep} ${i < step ? styles.done : i === step ? styles.active : ''}`} />
      ))}
    </div>
  )

  // Step 0 — Welcome
  if (step === 0) return (
    <>
      {progress}
      <div className={styles.obStepLabel}>Step 1 of {OB_STEPS.length - 1}</div>
      <div className={styles.formTitle}>Welcome! 👋</div>
      <div className={styles.formSubtitle}>
        Let's take 60 seconds to set up your farm management system. You can change any of this later in Settings.
      </div>
      <div className={styles.form}>
        <button className={styles.btn} onClick={() => setStep(1)}>
          Get Started →
        </button>
      </div>
    </>
  )

  // Step 1 — Farm details
  if (step === 1) return (
    <>
      {progress}
      <div className={styles.obStepLabel}>Step 1 of {OB_STEPS.length - 1} — Farm Details</div>
      <div className={styles.formTitle}>Your Farm</div>
      <div className={styles.formSubtitle}>This appears on your PDF reports and activity logs.</div>
      <div className={styles.form}>
        <div className={styles.field}>
          <label className={styles.label}>Farm Name</label>
          <input className={styles.input} value={farmName}
            onChange={e => setFarmName(e.target.value)} placeholder="e.g. Eldesign Poultry Farm" />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Location</label>
          <input className={styles.input} value={farmLoc}
            onChange={e => setFarmLoc(e.target.value)} placeholder="City, State, Country" />
          <div className={styles.obHint}>Used on PDF reports for government submissions.</div>
        </div>
        <button className={styles.btn} onClick={() => setStep(2)}
          disabled={!farmName.trim()}>Next →</button>
        <button className={styles.ghostBtn} onClick={() => setStep(0)}>← Back</button>
      </div>
    </>
  )

  // Step 2 — Flock size
  if (step === 2) return (
    <>
      {progress}
      <div className={styles.obStepLabel}>Step 2 of {OB_STEPS.length - 1} — Your Flock</div>
      <div className={styles.formTitle}>How large is your flock?</div>
      <div className={styles.formSubtitle}>
        This helps us configure the right defaults for your farm. You can add individual flock groups in the app.
      </div>
      <div className={styles.form}>
        <div className={styles.birdCountGrid}>
          {FLOCK_OPTIONS.map(o => (
            <button
              key={o.value}
              className={`${styles.birdCountOption} ${flockSize === o.value ? styles.selected : ''}`}
              onClick={() => setFlockSize(o.value)}
            >
              <div className={styles.birdCountNum}>{o.label}</div>
              <div className={styles.birdCountLabel}>birds</div>
            </button>
          ))}
        </div>
        <button className={styles.btn} onClick={() => setStep(3)}
          disabled={!flockSize}>Next →</button>
        <button className={styles.ghostBtn} onClick={() => setStep(1)}>← Back</button>
      </div>
    </>
  )

  // Step 4 — Done
  return (
    <>
      {progress}
      <div className={styles.welcomeDone}>
        <div className={styles.welcomeIcon}>🎉</div>
        <div className={styles.welcomeTitle}>You're all set!</div>
        <div className={styles.welcomeDesc}>
          Your farm is configured. Sign in below to start recording your first month.
        </div>
        <div className={styles.welcomeSummary}>
          {[
            ['Farm Name', farmName],
            ['Location', farmLoc || '—'],
            ['Flock Size', flockSize + ' birds'],
          ].map(([label, value]) => (
            <div key={label} className={styles.welcomeSummaryRow}>
              <span className={styles.welcomeSummaryLabel}>{label}</span>
              <span className={styles.welcomeSummaryValue}>{value}</span>
            </div>
          ))}
        </div>
        <button className={styles.btn} onClick={finish} disabled={loading}>
          {loading ? <span className={styles.spinner} /> : 'Save & Continue to Sign In →'}
        </button>
      </div>
    </>
  )
}

// ── Login flow ─────────────────────────────────────────────────────────────────
function LoginFlow() {
  const { login, setSession } = useAuth()
  const [step, setStep]               = useState('email')
  const [email, setEmail]             = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword]       = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPw, setConfirmPw]     = useState('')
  const [userName, setUserName]       = useState('')
  const [setupMode, setSetupMode]     = useState('')
  const [error, setError]             = useState('')
  const [loading, setLoading]         = useState(false)
  const passwordRef = useRef(null)

  async function handleEmailSubmit(e) {
    e.preventDefault(); setError(''); setLoading(true)
    const result = await window.api.auth.checkEmail({ email: email.trim().toLowerCase() })
    setLoading(false)
    if (result.status === 'not_found')  { setError('No account found with this email address.'); return }
    if (result.status === 'inactive')   { setError('This account has been deactivated. Contact your administrator.'); return }
    if (result.status === 'pending')    { setDisplayName(result.name); setSetupMode('invite'); setStep('setup'); return }
    if (result.status === 'active')     { setDisplayName(result.name); setStep('password'); setTimeout(() => passwordRef.current?.focus(), 50) }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault(); setError(''); setLoading(true)
    const result = await login(email.trim().toLowerCase(), password)
    setLoading(false)
    if (!result.success) {
      if (result.error === 'no_password') { setSetupMode('owner'); setStep('setup') }
      else setError(result.message || 'Incorrect password.')
    }
  }

  async function handleSetupSubmit(e) {
    e.preventDefault(); setError('')
    if (newPassword !== confirmPw)    { setError('Passwords do not match.'); return }
    if (newPassword.length < 6)       { setError('Password must be at least 6 characters.'); return }
    setLoading(true)
    const result = setupMode === 'owner'
      ? await window.api.auth.setOwnerPassword({ email: email.trim().toLowerCase(), newPassword })
      : await window.api.auth.activateByEmail({ email: email.trim().toLowerCase(), name: userName.trim() || displayName, password: newPassword })
    setLoading(false)
    if (result.success) {
      await window.api.auth.saveSession(result.user)
      window.api.auth.setSession(result.user)
      setSession(result.user)
    } else {
      setError(result.message || 'Something went wrong.')
    }
  }

  function goBack() {
    setStep('email'); setPassword(''); setNewPassword(''); setConfirmPw(''); setUserName(''); setError('')
  }

  // ── Email step
  if (step === 'email') return (
    <>
      <div className={styles.formTitle}>Sign in</div>
      <div className={styles.formSubtitle}>Enter your email to continue to your farm dashboard.</div>
      <form onSubmit={handleEmailSubmit} className={styles.form}>
        {error && <div className={styles.error}>⚠ {error}</div>}
        <div className={styles.field}>
          <label className={styles.label}>Email address</label>
          <input className={styles.input} type="email" value={email} autoFocus
            onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
        </div>
        <button className={styles.btn} type="submit" disabled={loading}>
          {loading ? <span className={styles.spinner} /> : 'Continue →'}
        </button>
      </form>
    </>
  )

  // ── Password step
  if (step === 'password') return (
    <>
      <div className={styles.formTitle}>Welcome back</div>
      <div className={styles.formSubtitle}>Enter your password to sign in.</div>
      <form onSubmit={handlePasswordSubmit} className={styles.form}>
        <div className={styles.greetingChip}>
          <div className={styles.greetingAvatar}>{displayName?.[0]?.toUpperCase() || '?'}</div>
          <div>
            <div className={styles.greetingName}>{displayName}</div>
            <div className={styles.greetingEmail}>{email}</div>
          </div>
          <button type="button" className={styles.greetingChange} onClick={goBack}>Change</button>
        </div>
        {error && <div className={styles.error}>⚠ {error}</div>}
        <div className={styles.field}>
          <label className={styles.label}>Password</label>
          <input ref={passwordRef} className={styles.input} type="password" value={password}
            onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
        </div>
        <button className={styles.btn} type="submit" disabled={loading}>
          {loading ? <span className={styles.spinner} /> : 'Sign In'}
        </button>
        <button type="button" className={styles.ghostBtn} onClick={goBack}>← Back</button>
      </form>
    </>
  )

  // ── First-time setup step
  return (
    <>
      <div className={styles.formTitle}>{setupMode === 'owner' ? 'Secure your account' : 'Create your password'}</div>
      <div className={styles.formSubtitle}>
        {setupMode === 'owner'
          ? 'Set a password for your owner account to protect your farm data.'
          : `You've been invited. Set a password to activate your account.`}
      </div>
      <form onSubmit={handleSetupSubmit} className={styles.form}>
        <div className={styles.setupBanner}>
          <div className={styles.setupBannerTitle}>
            {setupMode === 'owner' ? '🔐 Owner Account Setup' : '🎉 You\'ve been invited!'}
          </div>
          {setupMode === 'owner'
            ? 'This is your first sign-in. Create a strong password — you\'re the owner of this system.'
            : `Welcome, ${displayName}. Your account is ready. Just set a password and you're in.`}
        </div>
        <div className={styles.emailTag}>✉ {email}</div>
        {error && <div className={styles.error}>⚠ {error}</div>}
        {setupMode === 'invite' && (
          <div className={styles.field}>
            <label className={styles.label}>Your Name</label>
            <input className={styles.input} type="text" value={userName} autoFocus
              onChange={e => setUserName(e.target.value)} placeholder={displayName || 'Full name'} />
          </div>
        )}
        <div className={styles.field}>
          <label className={styles.label}>New Password</label>
          <input className={styles.input} type="password" value={newPassword}
            autoFocus={setupMode === 'owner'}
            onChange={e => setNewPassword(e.target.value)} placeholder="Minimum 6 characters" required />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Confirm Password</label>
          <input className={styles.input} type="password" value={confirmPw}
            onChange={e => setConfirmPw(e.target.value)} placeholder="Repeat password" required />
        </div>
        <button className={styles.btn} type="submit" disabled={loading}>
          {loading ? <span className={styles.spinner} /> : 'Set Password & Sign In'}
        </button>
        <button type="button" className={styles.ghostBtn} onClick={goBack}>← Back</button>
      </form>
    </>
  )
}

// ── Root export ────────────────────────────────────────────────────────────────
export default function LoginScreen() {
  // null = still loading, true = show onboarding, false = show login
  const [showOnboarding, setShowOnboarding] = useState(null)

  useEffect(() => {
    window.api.settings.get().then(s => {
      setShowOnboarding(s?.onboarding_complete !== '1')
    }).catch(() => setShowOnboarding(false))
  }, [])

  if (showOnboarding === null) {
    return null
  }

  return (
    <div className={styles.shell}>
      <BrandPanel />

      <div className={styles.formSide}>
        <div className={styles.formSideTop}>
          <span className={styles.formSideVersion}>v1.0</span>
        </div>
        <div className={styles.formInner}>
          {showOnboarding
            ? <OnboardingFlow onComplete={() => setShowOnboarding(false)} />
            : <LoginFlow />
          }
        </div>
      </div>
    </div>
  )
}
