import React, { useState, useEffect, useCallback } from 'react'
import styles from './ActivityLog.module.css'

const ACTION_MAP = {
  'auth:login': { label: 'Signed in', color: 'blue' },
  'auth:logout': { label: 'Signed out', color: 'blue' },
  'auth:activate': { label: 'Activated account', color: 'blue' },
  'auth:changePassword': { label: 'Changed password', color: 'blue' },
  'user:invite': { label: 'Invited user', color: 'blue' },
  'user:update': { label: 'Updated user', color: 'orange' },
  'user:delete': { label: 'Deleted user', color: 'red' },
  'user:resetPassword': { label: 'Reset user password', color: 'orange' },
  'production:add': { label: '+ Added production record', color: 'green' },
  'production:update': { label: '~ Updated production record', color: 'orange' },
  'production:delete': { label: '− Deleted production record', color: 'red' },
  'sales:add': { label: '+ Added sale', color: 'green' },
  'sales:update': { label: '~ Updated sale', color: 'orange' },
  'sales:delete': { label: '− Deleted sale', color: 'red' },
  'expenses:add': { label: '+ Added expense', color: 'green' },
  'expenses:update': { label: '~ Updated expense', color: 'orange' },
  'expenses:delete': { label: '− Deleted expense', color: 'red' },
  'domestic:add': { label: '+ Added domestic usage', color: 'green' },
  'domestic:update': { label: '~ Updated domestic usage', color: 'orange' },
  'domestic:delete': { label: '− Deleted domestic usage', color: 'red' },
  'feed:add': { label: '+ Added feed record', color: 'green' },
  'feed:update': { label: '~ Updated feed record', color: 'orange' },
  'feed:delete': { label: '− Deleted feed record', color: 'red' },
  'health:add': { label: '+ Added health record', color: 'green' },
  'health:update': { label: '~ Updated health record', color: 'orange' },
  'health:delete': { label: '− Deleted health record', color: 'red' },
  'mortality:add': { label: '+ Added flock movement', color: 'green' },
  'mortality:update': { label: '~ Updated flock movement', color: 'orange' },
  'mortality:delete': { label: '− Deleted flock movement', color: 'red' },
  'flocks:add': { label: '+ Added flock', color: 'green' },
  'flocks:update': { label: '~ Updated flock', color: 'orange' },
  'flocks:delete': { label: '− Deleted flock', color: 'red' },
}

function formatAction(action) {
  return ACTION_MAP[action] || { label: action, color: 'gray' }
}

function formatTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleString()
}

function formatDetails(details) {
  if (!details) return null
  try {
    const obj = typeof details === 'string' ? JSON.parse(details) : details
    return Object.entries(obj)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')
  } catch {
    return String(details)
  }
}

const PAGE_SIZE = 50

export default function ActivityLog() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [users, setUsers] = useState([])
  const [filterUser, setFilterUser] = useState('')

  const loadLogs = useCallback(async (reset = false) => {
    setLoading(true)
    const currentOffset = reset ? 0 : offset
    const opts = { limit: PAGE_SIZE, offset: currentOffset }
    if (filterUser) opts.user_id = Number(filterUser)
    const result = await window.api.auth.getActivity(opts)
    setLoading(false)
    if (!Array.isArray(result)) return
    if (reset) {
      setLogs(result)
      setOffset(result.length)
    } else {
      setLogs(prev => [...prev, ...result])
      setOffset(prev => prev + result.length)
    }
    setHasMore(result.length === PAGE_SIZE)
  }, [offset, filterUser])

  // Load users for filter dropdown (best effort)
  useEffect(() => {
    window.api.auth.getUsers().then(r => {
      if (Array.isArray(r)) setUsers(r)
    }).catch(() => {})
  }, [])

  // Reset & reload when filter changes
  useEffect(() => {
    setOffset(0)
    setHasMore(true)
    ;(async () => {
      setLoading(true)
      const opts = { limit: PAGE_SIZE, offset: 0 }
      if (filterUser) opts.user_id = Number(filterUser)
      const result = await window.api.auth.getActivity(opts)
      setLoading(false)
      if (Array.isArray(result)) {
        setLogs(result)
        setOffset(result.length)
        setHasMore(result.length === PAGE_SIZE)
      }
    })()
  }, [filterUser])

  function handleLoadMore() {
    loadLogs(false)
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Activity Log</h2>
          <p className={styles.desc}>A history of all actions taken in the system.</p>
        </div>
        {users.length > 0 && (
          <div className={styles.filterRow}>
            <label className={styles.filterLabel}>Filter by user:</label>
            <select className={styles.filterSelect} value={filterUser} onChange={e => setFilterUser(e.target.value)}>
              <option value="">All users</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Time</th>
              <th>User</th>
              <th>Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => {
              const { label, color } = formatAction(log.action)
              return (
                <tr key={log.id}>
                  <td className={styles.timeCell}>{formatTime(log.created_at)}</td>
                  <td className={styles.userCell}>
                    {log.user_name && <span className={styles.userName}>{log.user_name}</span>}
                    {log.user_email && <span className={styles.userEmail}>{log.user_email}</span>}
                    {!log.user_name && !log.user_email && <span className={styles.noUser}>—</span>}
                  </td>
                  <td>
                    <span className={`${styles.actionLabel} ${styles['action_' + color]}`}>{label}</span>
                    {log.entity && log.entity_id && (
                      <span className={styles.entityTag}>{log.entity} #{log.entity_id}</span>
                    )}
                  </td>
                  <td className={styles.detailsCell}>{formatDetails(log.details)}</td>
                </tr>
              )
            })}
            {!loading && logs.length === 0 && (
              <tr><td colSpan={4} className={styles.emptyRow}>No activity recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {loading && <div className={styles.loadingRow}>Loading...</div>}

      {!loading && hasMore && (
        <div className={styles.loadMoreRow}>
          <button className={styles.loadMoreBtn} onClick={handleLoadMore}>Load More</button>
        </div>
      )}
    </div>
  )
}
