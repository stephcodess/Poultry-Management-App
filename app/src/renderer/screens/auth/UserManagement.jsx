import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../utils/AuthContext'
import styles from './UserManagement.module.css'
import PageLoader from '../../components/common/PageLoader'

const APP_ACCESS_LABELS = { owner: 'Owner', admin: 'Admin', editor: 'Editor', viewer: 'Viewer', none: 'No Access' }
const APP_ACCESS_ORDER = { owner: 4, admin: 3, editor: 2, viewer: 1, none: 0 }

const DEFAULT_POSITIONS = ['Farm Hand', 'Driver', 'Security', 'Accountant', 'Supervisor', 'Cleaner', 'Veterinarian', 'Other']
function loadPositions() { try { return JSON.parse(localStorage.getItem('staff_positions') || '[]') } catch { return [] } }
function savePositions(list) { localStorage.setItem('staff_positions', JSON.stringify(list)) }

function PositionField({ value, onChange }) {
  const [customPositions, setCustomPositions] = useState(loadPositions)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  function confirmAdd() {
    const val = draft.trim()
    if (val && ![...DEFAULT_POSITIONS, ...customPositions].includes(val)) {
      const updated = [...customPositions, val]
      setCustomPositions(updated)
      savePositions(updated)
      onChange(val)
    }
    setAdding(false)
    setDraft('')
  }

  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label className={styles.label}>Position / Role</label>
        {!adding && (
          <button type="button" className={styles.addPositionBtn} onClick={() => { setAdding(true); setDraft('') }}>
            + Add Position
          </button>
        )}
      </div>
      {adding ? (
        <div className={styles.inlineAddRow}>
          <input
            autoFocus
            className={styles.input}
            value={draft}
            placeholder="e.g. Nurse, Mechanic"
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); confirmAdd() }
              if (e.key === 'Escape') { setAdding(false); setDraft('') }
            }}
          />
          <button type="button" className={styles.inlineAddConfirm} onClick={confirmAdd}>Add</button>
          <button type="button" className={styles.inlineAddCancel} onClick={() => { setAdding(false); setDraft('') }}>✕</button>
        </div>
      ) : (
        <select className={styles.input} value={value} onChange={e => onChange(e.target.value)}>
          <option value="">— Select position —</option>
          <optgroup label="Common">
            {DEFAULT_POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </optgroup>
          {customPositions.length > 0 && (
            <optgroup label="Custom">
              {customPositions.map(p => <option key={p} value={p}>{p}</option>)}
            </optgroup>
          )}
        </select>
      )}
    </div>
  )
}

function AccessBadge({ role }) {
  const cls = role === 'none' ? styles.badge_none : styles['badge_' + role]
  return <span className={`${styles.badge} ${cls}`}>{APP_ACCESS_LABELS[role] || role}</span>
}

function StatusBadge({ user }) {
  if (user.role === 'none') return <span className={`${styles.badge} ${styles.badge_staff}`}>Staff only</span>
  if (!user.has_password && user.is_active) return <span className={`${styles.badge} ${styles.badge_pending}`}>Pending</span>
  if (!user.is_active) return <span className={`${styles.badge} ${styles.badge_inactive}`}>Inactive</span>
  return <span className={`${styles.badge} ${styles.badge_active}`}>Active</span>
}

export default function UserManagement() {
  const { session, can } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [addSuccess, setAddSuccess] = useState(null)
  const [error, setError] = useState('')

  const loadUsers = useCallback(async () => {
    setLoading(true)
    const result = await window.api.auth.getUsers()
    setLoading(false)
    if (Array.isArray(result)) setUsers(result)
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  async function handleAdd(data) {
    const result = await window.api.auth.inviteUser(data)
    if (result.success) {
      setShowAddModal(false)
      setAddSuccess(result.user)
      loadUsers()
    } else {
      return result.message || 'Failed to add staff.'
    }
  }

  async function handleUpdate(data) {
    const result = await window.api.auth.updateUser(data)
    if (result.success) {
      setEditUser(null)
      loadUsers()
    } else {
      return result.message || 'Failed to update staff.'
    }
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`Remove "${name}" from staff? This cannot be undone.`)) return
    const result = await window.api.auth.deleteUser({ id })
    if (result.success) loadUsers()
    else setError(result.message || 'Failed to remove staff.')
  }

  // Roles this session can assign (excluding owner, excluding own or higher)
  const assignableRoles = ['admin', 'editor', 'viewer', 'none'].filter(r =>
    r === 'none' || APP_ACCESS_ORDER[r] < APP_ACCESS_ORDER[session?.role]
  )

  if (!can('manage_users')) {
    return <div className={styles.forbidden}>You do not have permission to manage staff.</div>
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Staff Management</h2>
          <p className={styles.desc}>
            Manage all farm staff. Staff with app access can sign in; others are staff-only records used for expenses (salary, IOU, bonus, etc.).
          </p>
        </div>
        <button className={styles.inviteBtn} onClick={() => { setAddSuccess(null); setShowAddModal(true) }}>
          + Add Staff
        </button>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {addSuccess && (
        <div className={styles.successBanner}>
          <strong>✓ {addSuccess.name}</strong> has been added
          {addSuccess.role !== 'none'
            ? <> as <strong>{APP_ACCESS_LABELS[addSuccess.role]}</strong>. They can sign in with their email to set a password.</>
            : <> as a staff member with no app access.</>
          }
          <button className={styles.dismissLink} onClick={() => setAddSuccess(null)}>Dismiss</button>
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
                <th>Position</th>
                <th>Phone</th>
                <th>Email</th>
                <th>App Access</th>
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
                  <td className={styles.dimCell}>{u.position || <span className={styles.dash}>—</span>}</td>
                  <td className={styles.dimCell}>{u.phone || <span className={styles.dash}>—</span>}</td>
                  <td className={styles.emailCell}>{u.email || <span className={styles.dash}>—</span>}</td>
                  <td><AccessBadge role={u.role} /></td>
                  <td><StatusBadge user={u} /></td>
                  <td className={styles.dateCell}>
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : '—'}
                  </td>
                  <td className={styles.actionsCell}>
                    {(u.id === session?.id || can('owner_only') || APP_ACCESS_ORDER[u.role] < APP_ACCESS_ORDER[session?.role]) && (
                      <button className={styles.editBtn} onClick={() => setEditUser(u)}>Edit</button>
                    )}
                    {can('owner_only') && u.id !== session?.id && u.role !== 'owner' && (
                      <button className={styles.deleteBtn} onClick={() => handleDelete(u.id, u.name)}>Remove</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAddModal && (
        <AddModal
          assignableRoles={assignableRoles}
          onSubmit={handleAdd}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {editUser && (
        <EditModal
          user={editUser}
          assignableRoles={assignableRoles}
          session={session}
          onSubmit={handleUpdate}
          onClose={() => setEditUser(null)}
        />
      )}
    </div>
  )
}

function AddModal({ assignableRoles, onSubmit, onClose }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('none')
  const [position, setPosition] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const needsEmail = role !== 'none'

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('Name is required.'); return }
    if (needsEmail && !email.trim()) { setError('Email is required for staff with app access.'); return }
    setLoading(true)
    const err = await onSubmit({ name: name.trim(), email: email.trim() || null, role, position: position.trim() || null, phone: phone.trim() || null })
    setLoading(false)
    if (err) setError(err)
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3>Add Staff Member</h3>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          {error && <div className={styles.inlineError}>{error}</div>}
          <div className={styles.field}>
            <label className={styles.label}>Full Name *</label>
            <input className={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Emeka Okafor" required autoFocus />
          </div>
          <PositionField value={position} onChange={setPosition} />
          <div className={styles.field}>
            <label className={styles.label}>Phone</label>
            <input className={styles.input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 08012345678" />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>App Access</label>
            <select className={styles.input} value={role} onChange={e => setRole(e.target.value)}>
              <option value="none">No Access (staff record only)</option>
              {assignableRoles.filter(r => r !== 'none').map(r => (
                <option key={r} value={r}>{APP_ACCESS_LABELS[r]}</option>
              ))}
            </select>
            <div className={styles.roleHints}>
              <span><strong>No Access</strong> — staff record only; can be assigned to expenses</span>
              <span><strong>Viewer</strong> — can view records, no editing</span>
              <span><strong>Editor</strong> — can add, edit and delete records</span>
              <span><strong>Admin</strong> — full access + manage staff</span>
            </div>
          </div>
          {needsEmail && (
            <div className={styles.field}>
              <label className={styles.label}>Email address *</label>
              <input className={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" required={needsEmail} />
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                They will sign in with this email and set their own password.
              </div>
            </div>
          )}
          <div className={styles.modalActions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.saveBtn} disabled={loading}>
              {loading ? 'Adding...' : 'Add Staff'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditModal({ user, assignableRoles, session, onSubmit, onClose }) {
  const [name, setName] = useState(user.name)
  const [position, setPosition] = useState(user.position || '')
  const [phone, setPhone] = useState(user.phone || '')
  const [role, setRole] = useState(user.role)
  const [isActive, setIsActive] = useState(!!user.is_active)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const isOwner = user.role === 'owner'
  const isSelf = user.id === session?.id
  const rolesCanAssign = session?.role === 'owner'
    ? ['admin', 'editor', 'viewer', 'none']
    : assignableRoles

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const err = await onSubmit({ id: user.id, name, role, position: position.trim() || null, phone: phone.trim() || null, is_active: isActive ? 1 : 0 })
    setLoading(false)
    if (err) setError(err)
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3>Edit Staff {isSelf && <span className={styles.selfTag}>you</span>}</h3>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          {error && <div className={styles.inlineError}>{error}</div>}
          <div className={styles.field}>
            <label className={styles.label}>Full Name</label>
            <input className={styles.input} value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <PositionField value={position} onChange={setPosition} />
          <div className={styles.field}>
            <label className={styles.label}>Phone</label>
            <input className={styles.input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 08012345678" />
          </div>
          {user.email && (
            <div className={styles.field}>
              <label className={styles.label}>Email</label>
              <input className={styles.input} value={user.email} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} />
            </div>
          )}
          <div className={styles.field}>
            <label className={styles.label}>App Access</label>
            {isOwner ? (
              <div className={styles.lockedRole}>
                <span className={`${styles.badge} ${styles.badge_owner}`}>Owner</span>
                <span className={styles.lockedNote}>Owner access cannot be changed</span>
              </div>
            ) : (
              <select className={styles.input} value={role} onChange={e => setRole(e.target.value)}>
                {rolesCanAssign.map(r => (
                  <option key={r} value={r}>{APP_ACCESS_LABELS[r]}</option>
                ))}
              </select>
            )}
          </div>
          {!isSelf && (
            <div className={styles.checkboxField}>
              <input type="checkbox" id="isActive" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
              <label htmlFor="isActive" className={styles.checkboxLabel}>Active</label>
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
