import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './utils/AuthContext'
import { MonthProvider } from './utils/MonthContext'
import AppShell from './components/layout/AppShell'
import LoginScreen from './screens/LoginScreen'
import Dashboard from './screens/Dashboard'
import Production from './screens/Production'
import Sales from './screens/Sales'
import FeedLog from './screens/FeedLog'
import HealthRecords from './screens/HealthRecords'
import Mortality from './screens/Mortality'
import styles from './App.module.css'

function AppContent() {
  const { session } = useAuth()
  if (session === undefined) return <div className={styles.loading}><div className={styles.spinner} /></div>
  if (!session) return <LoginScreen />
  return (
    <MonthProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/production" element={<Production />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/feed" element={<FeedLog />} />
          <Route path="/health" element={<HealthRecords />} />
          <Route path="/mortality" element={<Mortality />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AppShell>
    </MonthProvider>
  )
}

export default function App() {
  return <AuthProvider><AppContent /></AuthProvider>
}
