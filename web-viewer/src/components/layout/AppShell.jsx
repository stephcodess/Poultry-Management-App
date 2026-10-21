import React, { useState } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import styles from './AppShell.module.css'

export default function AppShell({ children }) {
  const [menuOpen, setMenuOpen] = useState(false)

  function handleMenuToggle() {
    setMenuOpen(prev => !prev)
  }

  function handleOverlayClick() {
    setMenuOpen(false)
  }

  return (
    <div className={styles.shell}>
      {menuOpen && (
        <div className={styles.overlay} onClick={handleOverlayClick} />
      )}
      <Sidebar menuOpen={menuOpen} onMenuToggle={handleMenuToggle} />
      <div className={styles.main}>
        <Header onMenuToggle={handleMenuToggle} />
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  )
}
