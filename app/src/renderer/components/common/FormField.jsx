import React from 'react'
import styles from './FormField.module.css'

export default function FormField({ label, error, children, hint }) {
  return (
    <div className={styles.field}>
      {label && <label className={styles.label}>{label}</label>}
      {children}
      {hint && !error && <span className={styles.hint}>{hint}</span>}
      {error && <span className={styles.error}>{error}</span>}
    </div>
  )
}

export function Input({ className = '', ...props }) {
  return <input className={`${styles.input} ${className}`} {...props} />
}

export function Select({ className = '', children, ...props }) {
  return (
    <select className={`${styles.input} ${className}`} {...props}>
      {children}
    </select>
  )
}
