import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../utils/AuthContext'
import styles from './Sidebar.module.css'

const NAV_ITEMS = [
  { to: '/dashboard',  label: 'Dashboard',      icon: '▦',  tour: 'nav-dashboard'  },
  { divider: true, label: 'FARM RECORDS' },
  { to: '/production', label: 'Production',      icon: '🥚', tour: 'nav-production' },
  { to: '/sales',      label: 'Sales',           icon: '🛒', tour: 'nav-sales'      },
  { to: '/debtors',    label: 'Debtors',         icon: '📒', tour: 'nav-debtors'    },
  { to: '/expenses',   label: 'Expenses',        icon: '💸', tour: 'nav-expenses'   },
  { divider: true, label: 'FLOCK HEALTH' },
  { to: '/mortality',  label: 'Flock Movement',  icon: '🐓', tour: 'nav-mortality'  },
  { to: '/feed',       label: 'Feed Log',        icon: '🌾', tour: 'nav-feed'       },
  { to: '/health',     label: 'Health Records',  icon: '🏥', tour: 'nav-health'     },
  { divider: true, label: 'SYSTEM' },
  { to: '/settings',   label: 'Settings',        icon: '⚙',  tour: 'nav-settings'  },
]

const ROLE_COLORS = {
  owner: { bg: '#ede9fe', color: '#6d28d9' },
  admin: { bg: '#dbeafe', color: '#1d4ed8' },
  editor: { bg: '#dcfce7', color: '#16a34a' },
  viewer: { bg: '#f1f5f9', color: '#475569' },
}

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function Sidebar() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const isAdminOrOwner = session?.role === 'admin' || session?.role === 'owner'
  const roleStyle = ROLE_COLORS[session?.role] || ROLE_COLORS.viewer

  return (
    <aside className={styles.sidebar}>
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
              data-tour={item.tour}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.active : ''}`
              }
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          )
        )}

        {isAdminOrOwner && (
          <>
            <div className={styles.divider}>ACCESS</div>
            <NavLink
              to="/users"
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.active : ''}`
              }
            >
              <span className={styles.navIcon}>👥</span>
              <span>Users</span>
            </NavLink>
            <NavLink
              to="/activity"
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.active : ''}`
              }
            >
              <span className={styles.navIcon}>📋</span>
              <span>Activity Log</span>
            </NavLink>
          </>
        )}
      </nav>

      <button className={styles.profileCard} onClick={() => navigate('/profile')}>
        <div className={styles.avatar}>{getInitials(session?.name)}</div>
        <div className={styles.profileInfo}>
          <div className={styles.profileName}>{session?.name || 'User'}</div>
          <div className={styles.profileRole} style={{ color: roleStyle.color }}>
            {session?.role}
          </div>
        </div>
        <div className={styles.profileChevron}>›</div>
      </button>
    </aside>
  )
}
