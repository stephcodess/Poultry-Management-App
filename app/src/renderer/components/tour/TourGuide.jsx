import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import styles from './TourGuide.module.css'

const TOUR_KEY = 'eldesign_tour_done'

const STEPS = [
  {
    id: 'sidebar-dashboard',
    target: '[data-tour="nav-dashboard"]',
    title: 'Your Farm Dashboard',
    body: 'This is your command centre. See egg production, revenue, expenses, and charts for any month at a glance.',
    placement: 'right',
    route: '/dashboard',
  },
  {
    id: 'header-month',
    target: '[data-tour="month-picker"]',
    title: 'Switch Months',
    body: 'Use this picker to navigate between months. All records — production, sales, expenses — filter to the selected month.',
    placement: 'bottom',
    route: '/dashboard',
  },
  {
    id: 'sidebar-production',
    target: '[data-tour="nav-production"]',
    title: 'Daily Production Log',
    body: 'Record how many eggs each flock lays every day. The app calculates yield %, crates, and loose pieces automatically.',
    placement: 'right',
    route: '/production',
  },
  {
    id: 'sidebar-sales',
    target: '[data-tour="nav-sales"]',
    title: 'Sales & Domestic Usage',
    body: 'Log every sale by egg size, flock, and price. There\'s also a Domestic Usage tab for eggs kept at home or gifted.',
    placement: 'right',
    route: '/sales',
  },
  {
    id: 'sidebar-expenses',
    target: '[data-tour="nav-expenses"]',
    title: 'Expenses & Wallet',
    body: 'Track every cost — feed, drugs, labour, maintenance. The wallet banner shows exactly how much cash remains after expenses.',
    placement: 'right',
    route: '/expenses',
  },
  {
    id: 'sidebar-feed',
    target: '[data-tour="nav-feed"]',
    title: 'Feed Log',
    body: 'Record every feed delivery — type, quantity (kg), cost per kg, and supplier. Helps you track feed-conversion efficiency.',
    placement: 'right',
    route: '/feed',
  },
  {
    id: 'sidebar-health',
    target: '[data-tour="nav-health"]',
    title: 'Health Records',
    body: 'Log vaccinations, medications, and treatments per flock. Set next-due dates and never miss a Lasota or calcium dose.',
    placement: 'right',
    route: '/health',
  },
  {
    id: 'header-export',
    target: '[data-tour="export-btn"]',
    title: 'Export PDF Report',
    body: 'Generate a detailed, government-ready PDF report for any month — production, sales, expenses, health records, and financial summary all in one document.',
    placement: 'bottom',
    route: '/dashboard',
  },
]

function getRect(selector) {
  const el = document.querySelector(selector)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right }
}

function Spotlight({ rect, padding = 8 }) {
  if (!rect) return null
  const t = rect.top - padding
  const l = rect.left - padding
  const w = rect.width + padding * 2
  const h = rect.height + padding * 2
  return (
    <svg className={styles.spotlight} aria-hidden>
      <defs>
        <mask id="tour-mask">
          <rect width="100%" height="100%" fill="white" />
          <rect x={l} y={t} width={w} height={h} rx={10} fill="black" />
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="rgba(0,0,0,0.65)" mask="url(#tour-mask)" />
      {/* Glowing ring around target */}
      <rect
        x={l - 2} y={t - 2} width={w + 4} height={h + 4}
        rx={11} fill="none"
        stroke="rgba(56,189,248,0.7)" strokeWidth={2}
        style={{ filter: 'drop-shadow(0 0 6px rgba(56,189,248,0.8))' }}
      />
    </svg>
  )
}

function Tooltip({ step, rect, stepIndex, total, onNext, onPrev, onSkip, placement }) {
  const GAP = 16
  if (!rect) return null

  let style = {}
  const TIP_W = 320
  const TIP_H_EST = 180

  if (placement === 'right') {
    style = { top: Math.max(12, rect.top + rect.height / 2 - TIP_H_EST / 2), left: rect.right + GAP }
  } else if (placement === 'bottom') {
    style = { top: rect.bottom + GAP, left: Math.max(12, rect.left + rect.width / 2 - TIP_W / 2) }
  } else if (placement === 'left') {
    style = { top: Math.max(12, rect.top + rect.height / 2 - TIP_H_EST / 2), left: rect.left - TIP_W - GAP }
  } else {
    style = { top: rect.top - TIP_H_EST - GAP, left: Math.max(12, rect.left + rect.width / 2 - TIP_W / 2) }
  }

  const isFirst = stepIndex === 0
  const isLast  = stepIndex === total - 1

  return (
    <div className={styles.tooltip} style={{ ...style, width: TIP_W }}>
      <div className={styles.tooltipHeader}>
        <div className={styles.tooltipStep}>{stepIndex + 1} / {total}</div>
        <button className={styles.tooltipSkip} onClick={onSkip}>Skip tour</button>
      </div>
      <div className={styles.tooltipTitle}>{step.title}</div>
      <div className={styles.tooltipBody}>{step.body}</div>
      <div className={styles.tooltipProgress}>
        {Array.from({ length: total }, (_, i) => (
          <div key={i} className={`${styles.progressDot} ${i === stepIndex ? styles.progressDotActive : i < stepIndex ? styles.progressDotDone : ''}`} />
        ))}
      </div>
      <div className={styles.tooltipActions}>
        {!isFirst && (
          <button className={styles.tooltipBtnGhost} onClick={onPrev}>← Back</button>
        )}
        <button className={styles.tooltipBtnPrimary} onClick={onNext}>
          {isLast ? '🎉 Finish Tour' : 'Next →'}
        </button>
      </div>
    </div>
  )
}

export default function TourGuide() {
  const location = useLocation()
  const navigate = useNavigate()
  const [active, setActive]     = useState(false)
  const [stepIdx, setStepIdx]   = useState(0)
  const [rect, setRect]         = useState(null)
  const rafRef = useRef(null)

  // Auto-start only once per install
  useEffect(() => {
    if (!localStorage.getItem(TOUR_KEY)) {
      // Small delay so sidebar/header have rendered
      const t = setTimeout(() => setActive(true), 800)
      return () => clearTimeout(t)
    }
  }, [])

  const step = STEPS[stepIdx]

  // Navigate to the right route for this step
  useEffect(() => {
    if (!active) return
    if (step.route && location.pathname !== step.route) {
      navigate(step.route)
    }
  }, [active, stepIdx]) // eslint-disable-line

  // Measure the target element, retry until it appears
  const measureTarget = useCallback(() => {
    const r = getRect(step.target)
    if (r) {
      setRect(r)
    } else {
      rafRef.current = requestAnimationFrame(measureTarget)
    }
  }, [step.target])

  useEffect(() => {
    if (!active) return
    setRect(null)
    // Wait a tick for navigation + render
    const t = setTimeout(() => {
      measureTarget()
    }, 220)
    return () => { clearTimeout(t); cancelAnimationFrame(rafRef.current) }
  }, [active, stepIdx, measureTarget])

  // Re-measure on resize
  useEffect(() => {
    if (!active) return
    const onResize = () => measureTarget()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [active, measureTarget])

  function finish() {
    localStorage.setItem(TOUR_KEY, '1')
    setActive(false)
  }

  function next() {
    if (stepIdx < STEPS.length - 1) setStepIdx(i => i + 1)
    else finish()
  }

  function prev() {
    if (stepIdx > 0) setStepIdx(i => i - 1)
  }

  if (!active) return null

  return (
    <div className={styles.overlay}>
      <Spotlight rect={rect} />
      <Tooltip
        step={step}
        rect={rect}
        stepIndex={stepIdx}
        total={STEPS.length}
        placement={step.placement}
        onNext={next}
        onPrev={prev}
        onSkip={finish}
      />
    </div>
  )
}

// Allow re-launching the tour from Settings
export function useTourLauncher() {
  return () => {
    localStorage.removeItem(TOUR_KEY)
    window.location.reload()
  }
}
