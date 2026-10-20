import React, { useEffect } from 'react'
import styles from './Modal.module.css'
import Button from './Button'

export default function Modal({ title, children, onClose, footer, maxWidth, blurred }) {
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className={`${styles.overlay} ${blurred ? styles.overlayBlurred : ''}`} onClick={onClose}>
      <div className={styles.modal} style={maxWidth ? { maxWidth } : undefined} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  )
}
