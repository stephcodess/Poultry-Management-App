import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import chickenLogo from './assets/chicken-logo.jpg'
import loadingVideo from './assets/149275-795936702_medium.mp4'
import AppShell from './components/layout/AppShell'
import Dashboard from './screens/Dashboard'
import Production from './screens/Production'
import Sales from './screens/Sales'
import Expenses from './screens/Expenses'
import Mortality from './screens/Mortality'
import FeedLog from './screens/FeedLog'
import HealthRecords from './screens/HealthRecords'
import Settings from './screens/Settings'
import UserManagement from './screens/auth/UserManagement'
import ActivityLog from './screens/auth/ActivityLog'
import Profile from './screens/auth/Profile'
import LoginScreen from './screens/auth/LoginScreen'
import Debtors from './screens/Debtors'
import { MonthProvider } from './utils/MonthContext'
import { AuthProvider, useAuth } from './utils/AuthContext'
import styles from './App.module.css'

const SPLASH_MS = 10000

function LoadingScreen() {
  return (
    <div className={styles.loadingScreen}>
      <video
        src={loadingVideo}
        className={styles.loadingVideoBg}
        autoPlay
        loop
        muted
        playsInline
      />
      <div className={styles.loadingOverlay}>
        <img src={chickenLogo} alt="Eldesign Poultry" className={styles.loadingLogo} />
        <div className={styles.loadingName}>Eldesign Poultry</div>
      </div>
    </div>
  )
}

function AppContent() {
  const { session } = useAuth()
  const [splashDone, setSplashDone] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), SPLASH_MS)
    return () => clearTimeout(t)
  }, [])

  // Show splash until minimum time has elapsed AND session has resolved
  if (!splashDone || session === undefined) {
    return <LoadingScreen />
  }

  // Not logged in
  if (session === null) {
    return <LoginScreen />
  }

  // Logged in
  return (
    <MonthProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/production" element={<Production />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/debtors" element={<Debtors />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/mortality" element={<Mortality />} />
          <Route path="/feed" element={<FeedLog />} />
          <Route path="/health" element={<HealthRecords />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/users" element={<UserManagement />} />
          <Route path="/activity" element={<ActivityLog />} />
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </AppShell>
    </MonthProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
