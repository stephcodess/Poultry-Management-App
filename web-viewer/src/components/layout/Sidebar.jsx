import React from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../utils/AuthContext'
import styles from './Sidebar.module.css'

const NAV_ITEMS = [
  { to: '/dashboard',  label: 'Dashboard',     icon: '▦' },
  { divider: true, label: 'FARM RECORDS' },
  { to: '/production', label: 'Production',     icon: '🥚' },
  { to: '/sales',      label: 'Sales',          icon: '🛒' },
  { to: '/expenses',   label: 'Expenses',       icon: '💸' },
  { to: '/debtors',    label: 'Debtors',        icon: '📋' },
  { divider: true, label: 'FLOCK HEALTH' },
  { to: '/mortality',  label: 'Flock Movement', icon: '🐓' },
  { to: '/feed',       label: 'Feed Log',       icon: '🌾' },
  { to: '/health',     label: 'Health Records', icon: '🏥' },
]

const ROLE_COLORS = {
  owner: { bg: '#ede9fe', color: '#6d28d9' },
  admin: { bg: '#dbeafe', color: '#1d4ed8' },
  editor: { bg: '#dcfce7', color: '#16a34a' },
  viewer: { bg: '#f1f5f9', color: '#475569' },
}

export default function Sidebar({ menuOpen, onMenuToggle }) {
  const { session, logout } = useAuth()
  const roleStyle = ROLE_COLORS[session?.role] || ROLE_COLORS.viewer
  const initials = session?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'

  return (
    <aside className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ''}`}>
      <button className={styles.closeBtn} onClick={onMenuToggle} aria-label="Close menu">✕</button>

      <div className={styles.brand}>
        <div className={styles.brandIcon}>🐔</div>
        <div>
          <div className={styles.brandName}>Eldesign</div>
          <div className={styles.brandSub}>Poultry Farm</div>
        </div>
      </div>

      <nav className={styles.nav}>
        {NAV_ITEMS.map((item, i) =>
          item.divider ? (
            <div key={i} className={styles.divider}>{item.label}</div>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
              onClick={() => onMenuToggle && menuOpen && onMenuToggle()}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          )
        )}
      </nav>

      <div className={styles.profileCard}>
        <div className={styles.avatar}>{initials}</div>
        <div className={styles.profileInfo}>
          <div className={styles.profileName}>{session?.name || 'Viewer'}</div>
          <div className={styles.profileRole} style={{ color: roleStyle.color }}>{session?.role}</div>
        </div>
        <button className={styles.logoutBtn} onClick={logout} title="Logout">⏻</button>
      </div>
    </aside>
  )
}
