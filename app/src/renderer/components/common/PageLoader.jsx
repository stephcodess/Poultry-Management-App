import React from 'react'
import chickenLogo from '../../assets/chicken-logo.jpg'
import loadingVideo from '../../assets/149275-795936702_medium.mp4'
import styles from './PageLoader.module.css'

export default function PageLoader() {
  return (
    <div className={styles.wrap}>
      <video src={loadingVideo} className={styles.videoBg} autoPlay loop muted playsInline />
      <div className={styles.overlay}>
        <img src={chickenLogo} alt="Loading" className={styles.logo} />
        <div className={styles.name}>Eldesign Poultry</div>
      </div>
    </div>
  )
}
