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
  '/sales': 'Sales',
  '/feed': 'Feed Log',
  '/health': 'Health Records',
  '/mortality': 'Flock Movement',
}

export default function Header() {
  const { pathname } = useLocation()
  const { monthYear, setMonthYear } = useMonth()
  const [online, setOnline] = useState(true)
  const title = TITLES[pathname] || 'Farm Viewer'

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
      <div className={styles.title}>{title}</div>
      <div className={styles.center}>
        <button className={styles.monthBtn} onClick={prevMonth}>‹</button>
        <span className={styles.monthLabel}>{formatMonthYear(monthYear)}</span>
        <button className={styles.monthBtn} onClick={nextMonth}>›</button>
      </div>
      <div className={styles.right}>
        <span className={`${styles.badge} ${styles.readOnly}`}>Read-only view</span>
        <span className={`${styles.badge} ${online ? styles.online : styles.offline}`}>
          {online ? '🟢 Live' : '🔴 Offline'}
        </span>
      </div>
    </header>
  )
}
