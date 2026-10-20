import React from 'react'
import styles from './StatCard.module.css'

export default function StatCard({ label, value, sub, accent, icon }) {
  return (
    <div className={`${styles.card} ${accent ? styles[accent] : ''}`}>
      {icon && <span className={styles.icon}>{icon}</span>}
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>{value}</div>
      {sub && <div className={styles.sub}>{sub}</div>}
    </div>
  )
}
