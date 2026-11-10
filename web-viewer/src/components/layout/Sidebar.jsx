import React from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../utils/AuthContext'
import styles from './Sidebar.module.css'
import chickenLogo from '../../assets/chicken-logo.jpg'

const NAV_ITEMS = [
  { to: '/dashboard',  label: 'Dashboard',      icon: '▦' },
  { divider: true, label: 'FARM RECORDS' },
  { to: '/production', label: 'Production',      icon: '🥚' },
  { to: '/sales',      label: 'Income',          icon: '🛒' },
  { to: '/expenses',   label: 'Expenses',        icon: '💸' },
  { to: '/debtors',    label: 'Debtors',         icon: '📋' },
  { divider: true, label: 'FLOCK HEALTH' },
  { to: '/mortality',  label: 'Flock Movement',  icon: '🐓' },
  { to: '/feed',       label: 'Feed Log',        icon: '🌾' },
  { to: '/health',     label: 'Health Records',  icon: '🏥' },
  { divider: true, label: 'REPORTS' },
  { to: '/reports',    label: 'Control Record',  icon: '📄' },
]

const ROLE_COLORS = {
  owner:  { bg: '#ede9fe', color: '#6d28d9' },
  admin:  { bg: '#dbeafe', color: '#1d4ed8' },
  editor: { bg: '#dcfce7', color: '#16a34a' },
  viewer: { bg: '#f1f5f9', color: '#475569' },
}

export default function Sidebar({ menuOpen, onMenuToggle }) {
  const { session, logout, can } = useAuth()
  const roleStyle = ROLE_COLORS[session?.role] || ROLE_COLORS.viewer
  const initials = session?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'

  const link = (to, label, icon) => (
    <NavLink
      key={to}
      to={to}
      className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
      onClick={() => menuOpen && onMenuToggle && onMenuToggle()}
    >
      <span className={styles.navIcon}>{icon}</span>
      <span>{label}</span>
    </NavLink>
  )

  return (
    <aside className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ''}`}>
      <button className={styles.closeBtn} onClick={onMenuToggle} aria-label="Close menu">✕</button>

      <div className={styles.brand}>
        <img src={chickenLogo} alt="Eldesign" className={styles.brandIcon} />
        <div>
          <div className={styles.brandName}>Eldesign</div>
          <div className={styles.brandSub}>Poultry Farm</div>
        </div>
      </div>

      <nav className={styles.nav}>
        {NAV_ITEMS.map((item, i) =>
          item.divider ? (
            <div key={i} className={styles.divider}>{item.label}</div>
          ) : link(item.to, item.label, item.icon)
        )}

        {can('manage_users') && (
          <>
            <div className={styles.divider}>STAFF & ACCESS</div>
            {link('/staff', 'Staff', '👥')}
          </>
        )}

        <div className={styles.divider}>SYSTEM</div>
        {link('/settings', 'Settings', '⚙')}
      </nav>

      <div className={styles.profileCard}>
        <div className={styles.avatar}>{initials}</div>
        <div className={styles.profileInfo}>
          <div className={styles.profileName}>{session?.name || 'User'}</div>
          <div className={styles.profileRole} style={{ color: roleStyle.color }}>{session?.role}</div>
        </div>
        <button className={styles.logoutBtn} onClick={logout} title="Logout">⏻</button>
      </div>
    </aside>
  )
}
