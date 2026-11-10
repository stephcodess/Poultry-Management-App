import React, { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../utils/AuthContext'
import Modal from '../components/common/Modal'
import Button from '../components/common/Button'
import FormField, { Input, Select } from '../components/common/FormField'
import PageLoader from '../components/common/PageLoader'
import styles from './StaffManagement.module.css'

const EMPTY_FORM = { name: '', position: '', phone: '', notes: '', is_active: 1 }

const DEFAULT_POSITIONS = ['Farm Hand', 'Driver', 'Security', 'Accountant', 'Supervisor', 'Cleaner', 'Veterinarian', 'Other']

function loadPositions() {
  try { return JSON.parse(localStorage.getItem('staff_positions') || '[]') } catch { return [] }
}
function savePositions(list) {
  localStorage.setItem('staff_positions', JSON.stringify(list))
}

export default function StaffManagement() {
  const { can } = useAuth()
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editRecord, setEditRecord] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [customPositions, setCustomPositions] = useState(loadPositions)
  const [addingPosition, setAddingPosition] = useState(false)
  const [newPosition, setNewPosition] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const data = await window.api.staff.getAll()
    setStaff(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openAdd() {
    setEditRecord(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowModal(true)
  }

  function openEdit(row) {
    setEditRecord(row)
    setForm({ name: row.name, position: row.position || '', phone: row.phone || '', notes: row.notes || '', is_active: row.is_active })
    setError('')
    setShowModal(true)
  }

  async function handleDelete(id, name) {
    if (!confirm(`Remove ${name} from staff? Any expenses linked to them will keep the record but lose the staff association.`)) return
    await window.api.staff.delete(id)
    load()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) { setError('Name is required.'); return }
    const payload = { ...form, name: form.name.trim(), position: form.position.trim() || null, phone: form.phone.trim() || null, notes: form.notes.trim() || null }
    if (editRecord) {
      await window.api.staff.update(editRecord.id, payload)
    } else {
      await window.api.staff.add(payload)
    }
    setShowModal(false)
    load()
  }

  const active = staff.filter(s => s.is_active)
  const inactive = staff.filter(s => !s.is_active)

  if (loading) return <PageLoader />

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Staff Management</h1>
          <p className={styles.desc}>Manage farm staff. Staff members here can be assigned to expenses (salary, IOU, bonus, etc.) but do not have software access.</p>
        </div>
        {can('write') && (
          <button className={styles.addBtn} onClick={openAdd}>+ Add Staff</button>
        )}
      </div>

      {staff.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>👷</div>
          <div className={styles.emptyTitle}>No staff added yet</div>
          <div className={styles.emptyDesc}>Add staff members to assign expenses like salary, IOU, and bonuses to them.</div>
          {can('write') && <button className={styles.addBtn} onClick={openAdd} style={{ marginTop: 16 }}>+ Add First Staff Member</button>}
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className={styles.tableWrapper}>
              <div className={styles.tableHeader}>Active Staff ({active.length})</div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Position</th>
                    <th>Phone</th>
                    <th>Notes</th>
                    {can('write') && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {active.map(s => (
                    <tr key={s.id}>
                      <td className={styles.nameCell}>{s.name}</td>
                      <td>{s.position || <span className={styles.dim}>—</span>}</td>
                      <td>{s.phone || <span className={styles.dim}>—</span>}</td>
                      <td className={styles.notesCell}>{s.notes || <span className={styles.dim}>—</span>}</td>
                      {can('write') && (
                        <td className={styles.actionsCell}>
                          <button className={styles.editBtn} onClick={() => openEdit(s)}>Edit</button>
                          <button className={styles.deactivateBtn} onClick={() => { setEditRecord(s); setForm({ name: s.name, position: s.position || '', phone: s.phone || '', notes: s.notes || '', is_active: 0 }); window.api.staff.update(s.id, { name: s.name, position: s.position || null, phone: s.phone || null, notes: s.notes || null, is_active: 0 }).then(load) }}>Deactivate</button>
                          <button className={styles.deleteBtn} onClick={() => handleDelete(s.id, s.name)}>Remove</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {inactive.length > 0 && (
            <div className={styles.tableWrapper} style={{ marginTop: 24 }}>
              <div className={styles.tableHeader} style={{ color: '#94a3b8' }}>Inactive Staff ({inactive.length})</div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Position</th>
                    <th>Phone</th>
                    <th>Notes</th>
                    {can('write') && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {inactive.map(s => (
                    <tr key={s.id} className={styles.inactiveRow}>
                      <td className={styles.nameCell}>{s.name} <span className={styles.inactiveBadge}>Inactive</span></td>
                      <td>{s.position || <span className={styles.dim}>—</span>}</td>
                      <td>{s.phone || <span className={styles.dim}>—</span>}</td>
                      <td className={styles.notesCell}>{s.notes || <span className={styles.dim}>—</span>}</td>
                      {can('write') && (
                        <td className={styles.actionsCell}>
                          <button className={styles.editBtn} onClick={() => openEdit(s)}>Edit</button>
                          <button className={styles.activateBtn} onClick={() => window.api.staff.update(s.id, { name: s.name, position: s.position || null, phone: s.phone || null, notes: s.notes || null, is_active: 1 }).then(load)}>Reactivate</button>
                          <button className={styles.deleteBtn} onClick={() => handleDelete(s.id, s.name)}>Remove</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showModal && (
        <Modal
          title={editRecord ? 'Edit Staff Member' : 'Add Staff Member'}
          onClose={() => setShowModal(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button onClick={handleSubmit}>Save</Button>
            </>
          }
        >
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0' }}>
            {error && <div className={styles.errorBanner}>{error}</div>}
            <FormField label="Full Name" required>
              <Input type="text" value={form.name} placeholder="e.g. Emeka Okafor"
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus required />
            </FormField>
            <FormField
              label={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Position / Role</span>
                  {!addingPosition && (
                    <button type="button" className={styles.addPositionBtn} onClick={() => { setAddingPosition(true); setNewPosition('') }}>
                      + Add Position
                    </button>
                  )}
                </div>
              }
            >
              {addingPosition ? (
                <div className={styles.inlineAddRow}>
                  <Input
                    autoFocus
                    type="text"
                    value={newPosition}
                    placeholder="e.g. Nurse, Mechanic"
                    onChange={e => setNewPosition(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const val = newPosition.trim()
                        if (val && ![...DEFAULT_POSITIONS, ...customPositions].includes(val)) {
                          const updated = [...customPositions, val]
                          setCustomPositions(updated)
                          savePositions(updated)
                          setForm(f => ({ ...f, position: val }))
                        }
                        setAddingPosition(false)
                        setNewPosition('')
                      }
                      if (e.key === 'Escape') { setAddingPosition(false); setNewPosition('') }
                    }}
                  />
                  <button type="button" className={styles.inlineAddConfirm} onClick={() => {
                    const val = newPosition.trim()
                    if (val && ![...DEFAULT_POSITIONS, ...customPositions].includes(val)) {
                      const updated = [...customPositions, val]
                      setCustomPositions(updated)
                      savePositions(updated)
                      setForm(f => ({ ...f, position: val }))
                    }
                    setAddingPosition(false)
                    setNewPosition('')
                  }}>Add</button>
                  <button type="button" className={styles.inlineAddCancel} onClick={() => { setAddingPosition(false); setNewPosition('') }}>✕</button>
                </div>
              ) : (
                <Select value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))}>
                  <option value="">— Select position —</option>
                  <optgroup label="Common">
                    {DEFAULT_POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </optgroup>
                  {customPositions.length > 0 && (
                    <optgroup label="Custom">
                      {customPositions.map(p => <option key={p} value={p}>{p}</option>)}
                    </optgroup>
                  )}
                </Select>
              )}
            </FormField>
            <FormField label="Phone Number">
              <Input type="tel" value={form.phone} placeholder="e.g. 08012345678"
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </FormField>
            <FormField label="Notes">
              <Input type="text" value={form.notes} placeholder="Any additional info"
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </FormField>
            <FormField label="Status">
              <Select value={String(form.is_active)} onChange={e => setForm(f => ({ ...f, is_active: Number(e.target.value) }))}>
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </Select>
            </FormField>
          </form>
        </Modal>
      )}
    </div>
  )
}
