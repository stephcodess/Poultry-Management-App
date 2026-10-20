import React from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import TourGuide from '../tour/TourGuide'
import AIChat from '../../screens/AIChat'
import styles from './AppShell.module.css'

export default function AppShell({ children }) {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.main}>
        <Header />
        <main className={styles.content}>{children}</main>
      </div>
      <TourGuide />
      <AIChat />
    </div>
  )
}
