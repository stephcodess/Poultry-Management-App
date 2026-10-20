import React from 'react'
import styles from './Button.module.css'

export default function Button({
  children, onClick, variant = 'primary',
  size = 'md', disabled = false, type = 'button', className = ''
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${styles.btn} ${styles[variant]} ${styles[size]} ${className}`}
    >
      {children}
    </button>
  )
}
