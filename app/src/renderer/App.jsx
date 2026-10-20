import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
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

function AppContent() {
  const { session } = useAuth()

  // Still loading session from storage
  if (session === undefined) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.spinner} />
      </div>
    )
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
