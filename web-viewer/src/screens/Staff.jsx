import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../utils/AuthContext'
import Modal from '../components/common/Modal'
import Button from '../components/common/Button'
import FormField from '../components/common/FormField'
import styles from './Staff.module.css'
import bcrypt from 'bcryptjs'

const APP_ACCESS_LABELS = { owner: 'Owner', admin: 'Admin', editor: 'Editor', viewer: 'Viewer', none: 'No Access' }
const APP_ACCESS_ORDER = { owner: 4, admin: 3, editor: 2, viewer: 1, none: 0 }

const DEFAULT_POSITIONS = ['Farm Hand', 'Driver', 'Security', 'Accountant', 'Supervisor', 'Cleaner', 'Veterinarian', 'Other']
function loadPositions() { try { return JSON.parse(localStorage.getItem('staff_positions') || '[]') } catch { return [] } }
function savePositions(list) { localStorage.setItem('staff_positions', JSON.stringify(list)) }

function Input({ type = 'text', value, onChange, ...props }) {
  return (
    <input type={type} value={value} onChange={onChange} {...props}
      style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 15, outline: 'none', fontFamily: 'var(--font)', background: 'var(--color-surface)', color: 'var(--color-text)', ...props.style }} />
  )
}

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
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Position / Role</span>
        {!adding && (
          <button type="button" onClick={() => { setAdding(true); setDraft('') }}
            style={{ fontSize: 12, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', padding: 0 }}>
            + Add Position
          </button>
        )}
      </div>
      {adding ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <Input autoFocus value={draft} placeholder="e.g. Nurse" onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmAdd() } if (e.key === 'Escape') { setAdding(false); setDraft('') } }} />
          <button type="button" onClick={confirmAdd}
            style={{ padding: '0 14px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13 }}>Add</button>
          <button type="button" onClick={() => { setAdding(false); setDraft('') }}
            style={{ padding: '0 10px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13 }}>✕</button>
        </div>
      ) : (
        <select value={value} onChange={e => onChange(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 15, outline: 'none', fontFamily: 'var(--font)', background: 'var(--color-surface)', color: 'var(--color-text)', cursor: 'pointer' }}>
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
  const colors = {
    owner: { bg: '#ede9fe', color: '#6d28d9' },
    admin: { bg: '#dbeafe', color: '#1d4ed8' },
    editor: { bg: '#dcfce7', color: '#16a34a' },
    viewer: { bg: '#f1f5f9', color: '#475569' },
    none: { bg: '#f8fafc', color: '#94a3b8' },
  }
  const c = colors[role] || colors.none
  return (
    <span style={{ display: 'inline-block', background: c.bg, color: c.color, borderRadius: 100, padding: '2px 9px', fontSize: 12, fontWeight: 700 }}>
      {APP_ACCESS_LABELS[role] || role}
    </span>
  )
}

export default function Staff() {
  const { session, can } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [successMsg, setSuccessMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('users').select('id, name, email, role, position, phone, is_active, last_login_at').order('name')
    setUsers(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const assignableRoles = ['admin', 'editor', 'viewer', 'none'].filter(r =>
    r === 'none' || APP_ACCESS_ORDER[r] < APP_ACCESS_ORDER[session?.role]
  )

  async function handleAdd(data) {
    const { name, email, role, position, phone, password } = data
    let password_hash = null
    if (password) {
      password_hash = await bcrypt.hash(password, 10)
    }
    const { error } = await supabase.from('users').insert({
      name: name.trim(),
      email: email?.trim() || null,
      role,
      position: position?.trim() || null,
      phone: phone?.trim() || null,
      password_hash,
      is_active: 1,
    })
    if (error) return error.message || 'Failed to add staff.'
    setSuccessMsg(`${name} has been added.`)
    setTimeout(() => setSuccessMsg(''), 4000)
    setShowAddModal(false)
    load()
  }

  async function handleUpdate(data) {
    const { id, name, role, position, phone, is_active, password } = data
    const updates = { name, role, position: position || null, phone: phone || null, is_active }
    if (password) {
      updates.password_hash = await bcrypt.hash(password, 10)
    }
    const { error } = await supabase.from('users').update(updates).eq('id', id)
    if (error) return error.message || 'Failed to update staff.'
    setEditUser(null)
    load()
  }

  async function handleDelete(id, name) {
    if (!confirm(`Remove "${name}" from staff? This cannot be undone.`)) return
    const { error } = await supabase.from('users').delete().eq('id', id)
    if (error) { setError(error.message); return }
    load()
  }

  if (!can('manage_users')) {
    return <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 14 }}>You do not have permission to manage staff.</div>
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '60px 24px', color: 'var(--color-text-secondary)', fontSize: 14 }}>
      <div style={{ width: 20, height: 20, border: '2px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <span>Loading staff…</span>
    </div>
  )

  const active = users.filter(u => u.is_active && u.role !== 'none')
  const staffOnly = users.filter(u => u.role === 'none')
  const inactive = users.filter(u => !u.is_active)

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Staff & Access</h1>
          <p className={styles.desc}>Manage farm staff. Staff with app access can sign in; others are staff records used for expenses (salary, IOU, bonus).</p>
        </div>
        <Button onClick={() => { setSuccessMsg(''); setShowAddModal(true) }}>+ Add Staff</Button>
      </div>

      {error && <div className={styles.errorBanner}>{error} <button onClick={() => setError('')} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button></div>}
      {successMsg && <div className={styles.successBanner}>✓ {successMsg}</div>}

      {users.length === 0 ? (
        <div className={styles.empty}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>👷</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>No staff added yet</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>Add staff to assign expenses like salary, IOU, and bonuses.</div>
          <Button onClick={() => setShowAddModal(true)}>+ Add First Staff Member</Button>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className={styles.tableSection}>
              <div className={styles.tableHeader}>Active Staff with App Access ({active.length})</div>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Position</th>
                      <th>Phone</th>
                      <th>Email</th>
                      <th>Access</th>
                      <th>Last Sign In</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.map(u => (
                      <tr key={u.id} className={u.id === session?.id ? styles.selfRow : ''}>
                        <td className={styles.nameCell}>
                          {u.name}
                          {u.id === session?.id && <span className={styles.youTag}>you</span>}
                        </td>
                        <td className={styles.dimCell}>{u.position || <span className={styles.dash}>—</span>}</td>
                        <td className={styles.dimCell}>{u.phone || <span className={styles.dash}>—</span>}</td>
                        <td className={styles.emailCell}>{u.email || <span className={styles.dash}>—</span>}</td>
                        <td><AccessBadge role={u.role} /></td>
                        <td className={styles.dimCell}>{u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : '—'}</td>
                        <td className={styles.actionsCell}>
                          {(u.id === session?.id || session?.role === 'owner' || APP_ACCESS_ORDER[u.role] < APP_ACCESS_ORDER[session?.role]) && (
                            <button className={styles.editBtn} onClick={() => setEditUser(u)}>Edit</button>
                          )}
                          {session?.role === 'owner' && u.id !== session?.id && u.role !== 'owner' && (
                            <button className={styles.deleteBtn} onClick={() => handleDelete(u.id, u.name)}>Remove</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {staffOnly.length > 0 && (
            <div className={styles.tableSection}>
              <div className={styles.tableHeader}>Staff Only (No App Access) ({staffOnly.length})</div>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Position</th>
                      <th>Phone</th>
                      <th>Email</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffOnly.map(u => (
                      <tr key={u.id}>
                        <td className={styles.nameCell}>{u.name}</td>
                        <td className={styles.dimCell}>{u.position || <span className={styles.dash}>—</span>}</td>
                        <td className={styles.dimCell}>{u.phone || <span className={styles.dash}>—</span>}</td>
                        <td className={styles.emailCell}>{u.email || <span className={styles.dash}>—</span>}</td>
                        <td className={styles.actionsCell}>
                          <button className={styles.editBtn} onClick={() => setEditUser(u)}>Edit</button>
                          {session?.role === 'owner' && (
                            <button className={styles.deleteBtn} onClick={() => handleDelete(u.id, u.name)}>Remove</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {inactive.length > 0 && (
            <div className={styles.tableSection}>
              <div className={styles.tableHeader} style={{ color: '#94a3b8' }}>Inactive Staff ({inactive.length})</div>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Position</th>
                      <th>Access</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {inactive.map(u => (
                      <tr key={u.id} className={styles.inactiveRow}>
                        <td className={styles.nameCell}>{u.name} <span className={styles.inactiveBadge}>Inactive</span></td>
                        <td className={styles.dimCell}>{u.position || <span className={styles.dash}>—</span>}</td>
                        <td><AccessBadge role={u.role} /></td>
                        <td className={styles.actionsCell}>
                          <button className={styles.editBtn} onClick={() => setEditUser(u)}>Edit</button>
                          {session?.role === 'owner' && (
                            <button className={styles.deleteBtn} onClick={() => handleDelete(u.id, u.name)}>Remove</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {showAddModal && (
        <AddModal assignableRoles={assignableRoles} onSubmit={handleAdd} onClose={() => setShowAddModal(false)} />
      )}
      {editUser && (
        <EditModal user={editUser} assignableRoles={assignableRoles} session={session} onSubmit={handleUpdate} onClose={() => setEditUser(null)} />
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
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const needsEmail = role !== 'none'

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('Name is required.'); return }
    if (needsEmail && !email.trim()) { setError('Email is required for staff with app access.'); return }
    if (needsEmail && !password.trim()) { setError('Password is required for staff with app access.'); return }
    setSaving(true)
    const err = await onSubmit({ name, email, role, position, phone, password: needsEmail ? password : null })
    setSaving(false)
    if (err) setError(err)
  }

  return (
    <Modal title="Add Staff Member" onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit} disabled={saving}>{saving ? 'Adding…' : 'Add Staff'}</Button></>}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <div style={{ background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#dc2626' }}>{error}</div>}
        <FormField label="Full Name">
          <input style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 15, outline: 'none', fontFamily: 'var(--font)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
            value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Emeka Okafor" autoFocus required />
        </FormField>
        <PositionField value={position} onChange={setPosition} />
        <FormField label="Phone">
          <input style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 15, outline: 'none', fontFamily: 'var(--font)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
            value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 08012345678" />
        </FormField>
        <FormField label="App Access">
          <select value={role} onChange={e => setRole(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 15, outline: 'none', fontFamily: 'var(--font)', background: 'var(--color-surface)', color: 'var(--color-text)', cursor: 'pointer' }}>
            <option value="none">No Access (staff record only)</option>
            {assignableRoles.filter(r => r !== 'none').map(r => (
              <option key={r} value={r}>{APP_ACCESS_LABELS[r]}</option>
            ))}
          </select>
          <div style={{ marginTop: 6, fontSize: 12, color: '#64748b', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span><strong>No Access</strong> — staff record only; can be assigned to expenses</span>
            <span><strong>Viewer</strong> — can view records, no editing</span>
            <span><strong>Editor</strong> — can add, edit and delete records</span>
            <span><strong>Admin</strong> — full access + manage staff</span>
          </div>
        </FormField>
        {needsEmail && (
          <>
            <FormField label="Email Address">
              <input type="email" style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 15, outline: 'none', fontFamily: 'var(--font)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" required />
            </FormField>
            <FormField label="Password">
              <input type="password" style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 15, outline: 'none', fontFamily: 'var(--font)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                value={password} onChange={e => setPassword(e.target.value)} placeholder="Set a password for this user" />
            </FormField>
          </>
        )}
      </form>
    </Modal>
  )
}

function EditModal({ user, assignableRoles, session, onSubmit, onClose }) {
  const [name, setName] = useState(user.name)
  const [position, setPosition] = useState(user.position || '')
  const [phone, setPhone] = useState(user.phone || '')
  const [role, setRole] = useState(user.role)
  const [isActive, setIsActive] = useState(!!user.is_active)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const isOwner = user.role === 'owner'
  const isSelf = user.id === session?.id
  const rolesCanAssign = session?.role === 'owner' ? ['admin', 'editor', 'viewer', 'none'] : assignableRoles

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const err = await onSubmit({ id: user.id, name, role, position, phone, is_active: isActive ? 1 : 0, password: password || null })
    setSaving(false)
    if (err) setError(err)
  }

  return (
    <Modal title={`Edit Staff${isSelf ? ' (you)' : ''}`} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button></>}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <div style={{ background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#dc2626' }}>{error}</div>}
        <FormField label="Full Name">
          <input style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 15, outline: 'none', fontFamily: 'var(--font)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
            value={name} onChange={e => setName(e.target.value)} required />
        </FormField>
        <PositionField value={position} onChange={setPosition} />
        <FormField label="Phone">
          <input style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 15, outline: 'none', fontFamily: 'var(--font)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
            value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 08012345678" />
        </FormField>
        {user.email && (
          <FormField label="Email">
            <input style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 15, fontFamily: 'var(--font)', background: 'var(--color-bg)', color: 'var(--color-text-secondary)', opacity: 0.7 }}
              value={user.email} disabled />
          </FormField>
        )}
        <FormField label="App Access">
          {isOwner ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
              <span style={{ display: 'inline-block', background: '#ede9fe', color: '#6d28d9', borderRadius: 100, padding: '2px 9px', fontSize: 12, fontWeight: 700 }}>Owner</span>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>Owner access cannot be changed</span>
            </div>
          ) : (
            <select value={role} onChange={e => setRole(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 15, outline: 'none', fontFamily: 'var(--font)', background: 'var(--color-surface)', color: 'var(--color-text)', cursor: 'pointer' }}>
              {rolesCanAssign.map(r => <option key={r} value={r}>{APP_ACCESS_LABELS[r]}</option>)}
            </select>
          )}
        </FormField>
        <FormField label="New Password (optional)">
          <input type="password" style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 15, outline: 'none', fontFamily: 'var(--font)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
            value={password} onChange={e => setPassword(e.target.value)} placeholder="Leave blank to keep existing password" />
        </FormField>
        {!isSelf && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            Active
          </label>
        )}
      </form>
    </Modal>
  )
}
