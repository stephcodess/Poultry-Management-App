import React, { useState } from 'react'
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

// inputClassName lets callers inject their own input style (e.g. LoginScreen.module.css)
export const PasswordInput = React.forwardRef(function PasswordInput({ inputClassName, ...props }, ref) {
  const [visible, setVisible] = useState(false)
  return (
    <div className={styles.pwWrap}>
      <input
        ref={ref}
        className={`${inputClassName ?? styles.input} ${styles.pwInput}`}
        type={visible ? 'text' : 'password'}
        {...props}
      />
      <button
        type="button"
        className={styles.pwToggle}
        onClick={() => setVisible(v => !v)}
        tabIndex={-1}
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? '🙈' : '👁'}
      </button>
    </div>
  )
})
