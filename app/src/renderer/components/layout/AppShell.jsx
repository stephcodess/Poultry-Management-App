import React from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import TourGuide from '../tour/TourGuide'
import AIChat from '../../screens/AIChat'
import styles from './AppShell.module.css'
import loadingVideo from '../../assets/149275-795936702_medium.mp4'

export default function AppShell({ children }) {
  return (
    <div className={styles.shell}>
      <video
        src={loadingVideo}
        className={styles.bgVideo}
        autoPlay
        loop
        muted
        playsInline
      />
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
