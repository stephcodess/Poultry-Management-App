import React from 'react'
import styles from './Button.module.css'

export default function Button({ children, variant = 'primary', size = 'md', disabled, onClick, type = 'button', ...rest }) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${styles.btn} ${styles[variant]} ${styles[size]}`}
      {...rest}
    >
      {children}
    </button>
  )
}
