import React from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import styles from './AppShell.module.css'

export default function AppShell({ children }) {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.main}>
        <Header />
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  )
}
