import React from 'react'
import styles from './FormField.module.css'

export default function FormField({ label, hint, error, children }) {
  return (
    <div className={styles.field}>
      {label && <label className={styles.label}>{label}</label>}
      {children}
      {hint && !error && <div className={styles.hint}>{hint}</div>}
      {error && <div className={styles.error}>{error}</div>}
    </div>
  )
}
