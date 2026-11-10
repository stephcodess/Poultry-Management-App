import React, { useState } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import styles from './AppShell.module.css'
import bgVideo from '../../assets/149275-795936702_medium.mp4'

export default function AppShell({ children }) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className={styles.shell}>
      <video src={bgVideo} className={styles.bgVideo} autoPlay loop muted playsInline />
      {menuOpen && <div className={styles.overlay} onClick={() => setMenuOpen(false)} />}
      <Sidebar menuOpen={menuOpen} onMenuToggle={() => setMenuOpen(o => !o)} />
      <div className={styles.main}>
        <Header onMenuToggle={() => setMenuOpen(o => !o)} />
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  )
}
