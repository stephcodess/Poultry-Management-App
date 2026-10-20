import React, { useState } from 'react'
import { useAuth } from '../../utils/AuthContext'
import styles from './Profile.module.css'

const ROLE_META = {
  owner:  { label: 'Owner',  desc: 'Full access — can manage users, settings, and all farm data.', color: '#6d28d9', bg: '#ede9fe' },
  admin:  { label: 'Admin',  desc: 'Can manage users and edit all farm records.',                  color: '#1d4ed8', bg: '#dbeafe' },
  editor: { label: 'Editor', desc: 'Can add and edit farm records. Cannot manage users.',          color: '#16a34a', bg: '#dcfce7' },
  viewer: { label: 'Viewer', desc: 'Read-only access. Cannot add or edit any records.',            color: '#475569', bg: '#f1f5f9' },
}

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function Profile() {
  const { session, setSession } = useAuth()
  const role = ROLE_META[session?.role] || ROLE_META.viewer

  const [name, setName] = useState(session?.name || '')
  const [nameStatus, setNameStatus] = useState('')

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState('')
  const [pwLoading, setPwLoading] = useState(false)

  async function handleSaveName(e) {
    e.preventDefault()
    if (!name.trim()) return
    const result = await window.api.auth.updateUser({ id: session.id, name: name.trim(), role: session.role, is_active: 1 })
    if (result.success) {
      const updated = { ...session, name: name.trim() }
      await window.api.auth.saveSession(updated)
      window.api.auth.setSession(updated)
      setSession(updated)
      setNameStatus('saved')
      setTimeout(() => setNameStatus(''), 2500)
    } else {
      setNameStatus('error')
      setTimeout(() => setNameStatus(''), 2500)
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    setPwError('')
    setPwSuccess('')
    if (pw.next !== pw.confirm) { setPwError('Passwords do not match.'); return }
    if (pw.next.length < 6) { setPwError('New password must be at least 6 characters.'); return }
    setPwLoading(true)
    const result = await window.api.auth.changePassword({ currentPassword: pw.current, newPassword: pw.next })
    setPwLoading(false)
    if (result.success) {
      setPwSuccess('Password updated successfully.')
      setPw({ current: '', next: '', confirm: '' })
    } else {
      setPwError(result.message || 'Failed to update password.')
    }
  }

  return (
    <div className={styles.page}>

      {/* Avatar + Identity */}
      <div className={styles.identityCard}>
        <div className={styles.avatarLg}>{getInitials(session?.name)}</div>
        <div className={styles.identityInfo}>
          <div className={styles.identityName}>{session?.name}</div>
          <div className={styles.identityEmail}>{session?.email}</div>
          <span className={styles.roleBadge} style={{ background: role.bg, color: role.color }}>
            {role.label}
          </span>
        </div>
      </div>

      {/* Role description */}
      <div className={styles.roleCard} style={{ borderColor: role.color + '44', background: role.bg }}>
        <div className={styles.roleCardLabel} style={{ color: role.color }}>Your role: {role.label}</div>
        <div className={styles.roleCardDesc}>{role.desc}</div>
      </div>

      <div className={styles.sections}>

        {/* Update name */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Display Name</h3>
          <form onSubmit={handleSaveName} className={styles.inlineForm}>
            <input
              className={styles.input}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your full name"
              required
            />
            <button className={styles.saveBtn} type="submit">Save</button>
            {nameStatus === 'saved' && <span className={styles.inlineSuccess}>✓ Saved</span>}
            {nameStatus === 'error' && <span className={styles.inlineError}>Failed</span>}
          </form>
        </div>

        {/* Change password */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Change Password</h3>
          <form onSubmit={handleChangePassword} className={styles.pwForm}>
            {pwError && <div className={styles.errorBox}>{pwError}</div>}
            {pwSuccess && <div className={styles.successBox}>{pwSuccess}</div>}
            <div className={styles.field}>
              <label className={styles.label}>Current Password</label>
              <input className={styles.input} type="password" value={pw.current}
                onChange={e => setPw(p => ({ ...p, current: e.target.value }))} required />
            </div>
            <div className={styles.pwRow}>
              <div className={styles.field}>
                <label className={styles.label}>New Password</label>
                <input className={styles.input} type="password" value={pw.next}
                  placeholder="Min. 6 characters"
                  onChange={e => setPw(p => ({ ...p, next: e.target.value }))} required />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Confirm New Password</label>
                <input className={styles.input} type="password" value={pw.confirm}
                  onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} required />
              </div>
            </div>
            <button className={styles.saveBtn} type="submit" disabled={pwLoading}>
              {pwLoading ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        </div>

      </div>
    </div>
  )
}
