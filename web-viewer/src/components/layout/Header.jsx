import React, { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useMonth } from '../../utils/MonthContext'
import { formatMonthYear } from '../../utils/format'
import { supabase } from '../../supabaseClient'
import dayjs from 'dayjs'
import styles from './Header.module.css'

const TITLES = {
  '/dashboard': 'Dashboard',
  '/production': 'Production',
  '/sales': 'Income',
  '/expenses': 'Expenses',
  '/debtors': 'Debtors',
  '/feed': 'Feed Log',
  '/health': 'Health Records',
  '/mortality': 'Flock Movement',
  '/settings': 'Settings',
  '/staff': 'Staff & Access',
  '/reports': 'Control Record',
}

export default function Header({ onMenuToggle }) {
  const { pathname } = useLocation()
  const { monthYear, setMonthYear } = useMonth()
  const [online, setOnline] = useState(null)
  const title = TITLES[pathname] || 'Eldesign Poultry'

  useEffect(() => {
    supabase.from('settings').select('key').limit(1)
      .then(({ error }) => setOnline(!error))
  }, [])

  function prevMonth() {
    setMonthYear(dayjs(monthYear + '-01').subtract(1, 'month').format('YYYY-MM'))
  }
  function nextMonth() {
    const next = dayjs(monthYear + '-01').add(1, 'month').format('YYYY-MM')
    if (next <= dayjs().format('YYYY-MM')) setMonthYear(next)
  }

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <button className={styles.hamburger} onClick={onMenuToggle} aria-label="Open menu">☰</button>
        <div className={styles.title}>{title}</div>
      </div>

      <div className={styles.center}>
        <button className={styles.monthBtn} onClick={prevMonth}>‹</button>
        <input
          type="month"
          className={styles.monthInput}
          value={monthYear}
          max={dayjs().format('YYYY-MM')}
          onChange={e => e.target.value && setMonthYear(e.target.value)}
        />
        <button className={styles.monthBtn} onClick={nextMonth}>›</button>
      </div>

      <div className={styles.right}>
        {online !== null && (
          <span className={`${styles.syncBadge} ${online ? styles.syncBadgeOk : styles.syncBadgeErr}`}>
            <span className={styles.syncDot} style={{ background: online ? '#16a34a' : '#dc2626' }} />
            {online ? 'Connected' : 'Offline'}
          </span>
        )}
      </div>
    </header>
  )
}
