import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../utils/AuthContext'
import styles from './UserManagement.module.css'
import PageLoader from '../../components/common/PageLoader'

const ROLE_LABELS = { owner: 'Owner', admin: 'Admin', editor: 'Editor', viewer: 'Viewer' }
const ROLE_ORDER = { owner: 4, admin: 3, editor: 2, viewer: 1 }

function RoleBadge({ role }) {
  return <span className={`${styles.badge} ${styles['badge_' + role]}`}>{ROLE_LABELS[role] || role}</span>
}

function StatusBadge({ user }) {
  // Pending = invited but hasn't set a password yet
  if (!user.has_password && user.is_active) return <span className={`${styles.badge} ${styles.badge_pending}`}>Pending</span>
  if (!user.is_active) return <span className={`${styles.badge} ${styles.badge_inactive}`}>Inactive</span>
  return <span className={`${styles.badge} ${styles.badge_active}`}>Active</span>
}

export default function UserManagement() {
  const { session, can } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [inviteSuccess, setInviteSuccess] = useState(null) // { name, email, role }
  const [error, setError] = useState('')
  const [pwSection, setPwSection] = useState({ current: '', next: '', confirm: '', error: '', success: '' })

  const loadUsers = useCallback(async () => {
    setLoading(true)
    const result = await window.api.auth.getUsers()
    setLoading(false)
    if (Array.isArray(result)) setUsers(result)
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  async function handleInvite(data) {
    const result = await window.api.auth.inviteUser(data)
    if (result.success) {
      setShowInviteModal(false)
      setInviteSuccess(result.user)
      loadUsers()
    } else {
      return result.message || 'Failed to invite user.'
    }
  }

  async function handleUpdate(data) {
    const result = await window.api.auth.updateUser(data)
    if (result.success) {
      setEditUser(null)
      loadUsers()
    } else {
      return result.message || 'Failed to update user.'
    }
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`Delete user "${name}"? This cannot be undone.`)) return
    const result = await window.api.auth.deleteUser({ id })
    if (result.success) loadUsers()
    else setError(result.message || 'Failed to delete user.')
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    setPwSection(p => ({ ...p, error: '', success: '' }))
    if (pwSection.next !== pwSection.confirm) {
      setPwSection(p => ({ ...p, error: 'Passwords do not match.' })); return
    }
    if (pwSection.next.length < 6) {
      setPwSection(p => ({ ...p, error: 'Password must be at least 6 characters.' })); return
    }
    const result = await window.api.auth.changePassword({ currentPassword: pwSection.current, newPassword: pwSection.next })
    if (result.success) {
      setPwSection({ current: '', next: '', confirm: '', error: '', success: 'Password updated successfully.' })
    } else {
      setPwSection(p => ({ ...p, error: result.message || 'Failed to change password.' }))
    }
  }

  const availableRoles = Object.keys(ROLE_LABELS).filter(r =>
    r !== 'owner' && ROLE_ORDER[r] < ROLE_ORDER[session?.role]
  )

  if (!can('manage_users')) {
    return <div className={styles.forbidden}>You do not have permission to manage users.</div>
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>User Management</h2>
          <p className={styles.desc}>Invite people by email. They set their own password when they first sign in.</p>
        </div>
        <button className={styles.inviteBtn} onClick={() => { setInviteSuccess(null); setShowInviteModal(true) }}>
          + Invite User
        </button>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {/* Success notice after invite */}
      {inviteSuccess && (
        <div className={styles.successBanner}>
          <strong>✓ {inviteSuccess.name}</strong> ({inviteSuccess.email}) has been added as <strong>{inviteSuccess.role}</strong>.
          They can now open the app, enter their email, and set their own password.
          <button className={styles.dismissLink} onClick={() => setInviteSuccess(null)}>Dismiss</button>
        </div>
      )}

      <div className={styles.tableWrapper}>
        {loading ? (
          <PageLoader />
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Sign In</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className={u.id === session?.id ? styles.selfRow : ''}>
                  <td className={styles.nameCell}>
                    {u.name}
                    {u.id === session?.id && <span className={styles.youTag}>you</span>}
                  </td>
                  <td className={styles.emailCell}>{u.email}</td>
                  <td><RoleBadge role={u.role} /></td>
                  <td><StatusBadge user={u} /></td>
                  <td className={styles.dateCell}>
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : '—'}
                  </td>
                  <td className={styles.actionsCell}>
                    {/* Edit: always allowed except admin trying to edit another admin/owner */}
                    {(u.id === session?.id || can('owner_only') || u.role === 'editor' || u.role === 'viewer') && (
                      <button className={styles.editBtn} onClick={() => setEditUser(u)}>Edit</button>
                    )}
                    {/* Remove: owner only, cannot remove self; can remove pending owners */}
                    {can('owner_only') && u.id !== session?.id && (u.role !== 'owner' || !u.has_password) && (
                      <button className={styles.deleteBtn} onClick={() => handleDelete(u.id, u.name)}>Remove</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>


      {showInviteModal && (
        <InviteModal
          availableRoles={availableRoles}
          onSubmit={handleInvite}
          onClose={() => setShowInviteModal(false)}
        />
      )}

      {editUser && (
        <EditModal
          user={editUser}
          availableRoles={availableRoles}
          session={session}
          onSubmit={handleUpdate}
          onClose={() => setEditUser(null)}
        />
      )}
    </div>
  )
}

function InviteModal({ availableRoles, onSubmit, onClose }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState(availableRoles[0] || 'viewer')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const err = await onSubmit({ name, email, role })
    setLoading(false)
    if (err) setError(err)
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3>Invite User</h3>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <p className={styles.modalHint}>
          Enter their email address and assign a role. They will be able to sign in and set their own password.
        </p>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          {error && <div className={styles.inlineError}>{error}</div>}
          <div className={styles.field}>
            <label className={styles.label}>Name</label>
            <input className={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="Full name" required />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Email address</label>
            <input className={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" required />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Role</label>
            <select className={styles.input} value={role} onChange={e => setRole(e.target.value)}>
              {availableRoles.map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
            <div className={styles.roleHints}>
              <span><strong>Admin</strong> — full access + user management</span>
              <span><strong>Editor</strong> — can add/edit/delete records</span>
              <span><strong>Viewer</strong> — read-only</span>
            </div>
          </div>
          <div className={styles.modalActions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.saveBtn} disabled={loading}>
              {loading ? 'Adding...' : 'Add User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditModal({ user, availableRoles, session, onSubmit, onClose }) {
  const [name, setName] = useState(user.name)
  const [role, setRole] = useState(user.role)
  const [isActive, setIsActive] = useState(!!user.is_active)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Owner role is locked — cannot be changed via this UI
  const isOwner = user.role === 'owner'
  const isSelf = user.id === session?.id

  // Roles the current session can assign (never include 'owner')
  const rolesCanAssign = session?.role === 'owner'
    ? ['admin', 'editor', 'viewer']
    : availableRoles

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const err = await onSubmit({ id: user.id, name, role, is_active: isActive ? 1 : 0 })
    setLoading(false)
    if (err) setError(err)
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3>Edit User {isSelf && <span className={styles.selfTag}>you</span>}</h3>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          {error && <div className={styles.inlineError}>{error}</div>}
          <div className={styles.field}>
            <label className={styles.label}>Name</label>
            <input className={styles.input} value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Email</label>
            <input className={styles.input} value={user.email} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} />
          </div>
          {isOwner ? (
            <div className={styles.field}>
              <label className={styles.label}>Role</label>
              <div className={styles.lockedRole}>
                <span className={`${styles.badge} ${styles.badge_owner}`}>Owner</span>
                <span className={styles.lockedNote}>Owner role cannot be changed</span>
              </div>
            </div>
          ) : (
            <div className={styles.field}>
              <label className={styles.label}>Role</label>
              <select className={styles.input} value={role} onChange={e => setRole(e.target.value)}>
                {rolesCanAssign.map(r => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
          )}
          {!isSelf && (
            <div className={styles.checkboxField}>
              <input type="checkbox" id="isActive" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
              <label htmlFor="isActive" className={styles.checkboxLabel}>Account active</label>
            </div>
          )}
          <div className={styles.modalActions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.saveBtn} disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
