import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../utils/AuthContext'
import Modal from '../components/common/Modal'
import Button from '../components/common/Button'
import FormField from '../components/common/FormField'
import styles from './Settings.module.css'

const FLOCK_COLORS = [
  '#2563eb', '#16a34a', '#d97706', '#dc2626',
  '#7c3aed', '#0891b2', '#be185d', '#059669',
  '#ea580c', '#0284c7',
]

function Input({ type = 'text', value, onChange, ...props }) {
  return (
    <input type={type} value={value} onChange={onChange} {...props}
      style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 15, outline: 'none', fontFamily: 'var(--font)', background: 'var(--color-surface)', color: 'var(--color-text)', ...props.style }} />
  )
}

function Sel({ value, onChange, children, ...props }) {
  return (
    <select value={value} onChange={onChange} {...props}
      style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 15, outline: 'none', fontFamily: 'var(--font)', background: 'var(--color-surface)', color: 'var(--color-text)', cursor: 'pointer', ...props.style }}
    >{children}</select>
  )
}

function SectionHead({ icon, iconBg, iconColor, title, desc }) {
  return (
    <div className={styles.sectionHead}>
      <div className={styles.sectionIcon} style={{ background: iconBg, color: iconColor }}>{icon}</div>
      <div className={styles.sectionHeadText}>
        <div className={styles.sectionTitle}>{title}</div>
        {desc && <div className={styles.sectionDesc}>{desc}</div>}
      </div>
    </div>
  )
}

export default function Settings() {
  const { can } = useAuth()
  const [settings, setSettings] = useState({})
  const [prices, setPrices] = useState([])
  const [flocks, setFlocks] = useState([])
  const [newFlock, setNewFlock] = useState({ name: '', color: FLOCK_COLORS[0], initial_bird_count: '' })
  const [newPrice, setNewPrice] = useState({ size: '', price_per_crate: '' })
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(null) // { id, name, type: 'flock'|'price' }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sRes, pRes, fRes] = await Promise.all([
        supabase.from('app_settings').select('key, value'),
        supabase.from('egg_prices').select('*').order('size'),
        supabase.from('flocks').select('*').order('name'),
      ])
      const settingsMap = {}
      for (const row of (sRes.data || [])) settingsMap[row.key] = row.value
      setSettings(settingsMap)
      setPrices(pRes.data || [])
      setFlocks(fRes.data || [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  function flash() { setSaved(true); setTimeout(() => setSaved(false), 2500) }

  async function upsertSetting(key, value) {
    await supabase.from('app_settings').upsert({ key, value: String(value) }, { onConflict: 'key' })
  }

  async function handleSaveSettings() {
    setSaving(true)
    try {
      await Promise.all([
        settings.farm_name != null ? upsertSetting('farm_name', settings.farm_name) : Promise.resolve(),
        settings.farm_location != null ? upsertSetting('farm_location', settings.farm_location) : Promise.resolve(),
        settings.feed_bag_kg != null ? upsertSetting('feed_bag_kg', settings.feed_bag_kg) : Promise.resolve(),
      ])
      flash()
    } finally { setSaving(false) }
  }

  async function handleSaveFlock(flock) {
    const updates = {
      name: flock.name,
      color: flock.color,
      is_active: flock.is_active ? 1 : 0,
      initial_bird_count: Number(flock.initial_bird_count) || 0,
      date_acquired: flock.date_acquired || null,
      breed: flock.breed || null,
      expected_lay_end: flock.expected_lay_end || null,
      target_yield_pct: Number(flock.target_yield_pct) || 80,
      age_weeks_at_acquisition: flock.age_weeks_at_acquisition != null && flock.age_weeks_at_acquisition !== ''
        ? Number(flock.age_weeks_at_acquisition) : null,
    }
    await supabase.from('flocks').update(updates).eq('id', flock.id)
    setFlocks(prev => prev.map(f => f.id === flock.id ? { ...f, ...updates } : f))
    flash()
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return
    if (confirmDelete.type === 'flock') {
      const { error } = await supabase.from('flocks').delete().eq('id', confirmDelete.id)
      if (!error) setFlocks(prev => prev.filter(f => f.id !== confirmDelete.id))
    } else if (confirmDelete.type === 'price') {
      const { error } = await supabase.from('egg_prices').delete().eq('id', confirmDelete.id)
      if (!error) setPrices(prev => prev.filter(x => x.id !== confirmDelete.id))
    }
    setConfirmDelete(null)
  }

  async function handleAddFlock() {
    if (!newFlock.name.trim()) return
    const { data } = await supabase.from('flocks').insert({
      name: newFlock.name.trim(),
      color: newFlock.color,
      initial_bird_count: Number(newFlock.initial_bird_count) || 0,
      is_active: 1,
    }).select().single()
    setNewFlock({ name: '', color: FLOCK_COLORS[0], initial_bird_count: '' })
    if (data) setFlocks(prev => [...prev, data])
  }

  async function handleSavePrice(p) {
    await supabase.from('egg_prices').update({ size: p.size, price_per_crate: Number(p.price_per_crate) }).eq('id', p.id)
    setPrices(prev => prev.map(x => x.id === p.id ? { ...x, size: p.size, price_per_crate: Number(p.price_per_crate) } : x))
    flash()
  }

  function handleDeletePrice(id) {
    const price = prices.find(p => p.id === id)
    setConfirmDelete({ id, name: price?.size || 'this egg size', type: 'price' })
  }

  async function handleAddPrice() {
    if (!newPrice.size.trim()) return
    const { data } = await supabase.from('egg_prices').insert({ size: newPrice.size.trim(), price_per_crate: Number(newPrice.price_per_crate) || 0 }).select().single()
    setNewPrice({ size: '', price_per_crate: '' })
    if (data) setPrices(prev => [...prev, data])
  }

  function updateFlock(id, field, value) {
    setFlocks(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f))
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '60px 24px', color: 'var(--color-text-secondary)', fontSize: 14 }}>
      <div style={{ width: 20, height: 20, border: '2px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <span>Loading settings…</span>
    </div>
  )

  return (
    <div className={styles.page}>

      {/* Farm Information */}
      <section className={styles.section}>
        <SectionHead icon="🏡" iconBg="#eff4ff" iconColor="#2563eb" title="Farm Information" desc="Basic details that appear on reports." />
        <div className={styles.sectionBody}>
          <div className={styles.farmGrid}>
            <FormField label="Farm Name">
              <Input placeholder="e.g. Eldesign Poultry Farm" value={settings.farm_name || ''} onChange={e => setSettings(s => ({ ...s, farm_name: e.target.value }))} />
            </FormField>
            <FormField label="Farm Location">
              <Input placeholder="e.g. Osogbo, Osun State" value={settings.farm_location || ''} onChange={e => setSettings(s => ({ ...s, farm_location: e.target.value }))} />
            </FormField>
          </div>
          {can('manage_settings') && (
            <div className={styles.saveRow}>
              <Button onClick={handleSaveSettings} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
              {saved && <span className={styles.savedMsg}>✓ Saved</span>}
            </div>
          )}
        </div>
      </section>

      {/* Flocks */}
      <section className={styles.section}>
        <SectionHead icon="🐓" iconBg="#f0fdf4" iconColor="#16a34a" title="Flocks" desc="Manage flock lifecycle details to get retirement alerts and production benchmarks." />
        <div className={styles.sectionBody}>
          <div className={styles.flockList}>
            {flocks.map(flock => {
              const retireSoon = flock.expected_lay_end &&
                new Date(flock.expected_lay_end) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
              return (
                <div key={flock.id} className={styles.flockCard}>
                  <div className={styles.flockCardTop}>
                    <div className={styles.flockColorDot} style={{ background: flock.color || '#6b7280' }} />
                    <span className={styles.flockCardName}>{flock.name || '—'}</span>
                    {retireSoon && <span className={styles.retireSoonBadge}>⚠ Retiring soon</span>}
                    <span className={`${styles.flockStatusBadge} ${flock.is_active ? styles.active : styles.inactive}`}>
                      {flock.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {can('manage_settings') && (
                    <>
                      <div className={styles.flockCardBody}>
                        <div className={styles.flockRow1}>
                          <div>
                            <div className={styles.fieldLabel}>Flock Name</div>
                            <Input value={flock.name} onChange={e => updateFlock(flock.id, 'name', e.target.value)} />
                          </div>
                          <div>
                            <div className={styles.fieldLabel}>Initial Birds</div>
                            <Input type="number" min="0" value={flock.initial_bird_count ?? ''} onChange={e => updateFlock(flock.id, 'initial_bird_count', e.target.value)} />
                          </div>
                          <div>
                            <div className={styles.fieldLabel}>Colour</div>
                            <input type="color" value={flock.color || '#2563eb'} onChange={e => updateFlock(flock.id, 'color', e.target.value)} className={styles.colorPicker} />
                          </div>
                          <label className={styles.toggle}>
                            <input type="checkbox" checked={!!flock.is_active} onChange={e => updateFlock(flock.id, 'is_active', e.target.checked ? 1 : 0)} />
                            Active
                          </label>
                        </div>
                        <div className={styles.flockRow2}>
                          <div>
                            <div className={styles.fieldLabel}>Date Acquired</div>
                            <Input type="date" value={flock.date_acquired || ''} onChange={e => updateFlock(flock.id, 'date_acquired', e.target.value)} />
                          </div>
                          <div>
                            <div className={styles.fieldLabel}>Breed / Type</div>
                            <Input placeholder="e.g. ISA Brown, Shaver" value={flock.breed || ''} onChange={e => updateFlock(flock.id, 'breed', e.target.value)} />
                          </div>
                          <div>
                            <div className={styles.fieldLabel}>Expected Retirement</div>
                            <Input type="date" value={flock.expected_lay_end || ''} onChange={e => updateFlock(flock.id, 'expected_lay_end', e.target.value)} />
                          </div>
                          <div>
                            <div className={styles.fieldLabel}>Target % Production</div>
                            <Input type="number" min="1" max="100" placeholder="80" value={flock.target_yield_pct ?? 80} onChange={e => updateFlock(flock.id, 'target_yield_pct', e.target.value)} />
                          </div>
                          <div>
                            <div className={styles.fieldLabel}>Age at Purchase (wks)</div>
                            <Input type="number" min="0" placeholder="e.g. 18" value={flock.age_weeks_at_acquisition ?? ''} onChange={e => updateFlock(flock.id, 'age_weeks_at_acquisition', e.target.value)} />
                          </div>
                        </div>
                      </div>
                      <div className={styles.flockCardFooter}>
                        <Button size="sm" variant="danger" onClick={() => setConfirmDelete({ id: flock.id, name: flock.name, type: 'flock' })}>Delete</Button>
                        <Button size="sm" onClick={() => handleSaveFlock(flock)}>Save Changes</Button>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>

          {can('manage_settings') && (
            <div className={styles.addPanel}>
              <div>
                <div className={styles.fieldLabel}>New Flock Name</div>
                <Input placeholder="e.g. Layer 3" value={newFlock.name} onChange={e => setNewFlock(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <div className={styles.fieldLabel}>Initial Birds</div>
                <Input type="number" min="0" placeholder="0" value={newFlock.initial_bird_count} onChange={e => setNewFlock(f => ({ ...f, initial_bird_count: e.target.value }))} />
              </div>
              <div>
                <div className={styles.fieldLabel}>Colour</div>
                <input type="color" value={newFlock.color} onChange={e => setNewFlock(f => ({ ...f, color: e.target.value }))} className={styles.colorPicker} />
              </div>
              <div style={{ paddingTop: 18 }}>
                <Button onClick={handleAddFlock}>+ Add Flock</Button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Egg Sizes & Prices */}
      <section className={styles.section}>
        <SectionHead icon="🥚" iconBg="#fef9ec" iconColor="#d97706" title="Egg Sizes & Prices" desc="Default prices auto-fill when recording a sale. You can override per transaction." />
        <div className={styles.sectionBody}>
          <div className={styles.priceTable}>
            <div className={styles.priceTableHead}>
              <span>Size Name</span>
              <span>Price per Crate (₦)</span>
              <span></span>
            </div>
            {prices.map(p => (
              <div key={p.id} className={styles.priceRow}>
                <Input value={p.size} onChange={e => setPrices(prev => prev.map(x => x.id === p.id ? { ...x, size: e.target.value } : x))} disabled={!can('manage_settings')} />
                <Input type="number" min="0" value={p.price_per_crate} onChange={e => setPrices(prev => prev.map(x => x.id === p.id ? { ...x, price_per_crate: e.target.value } : x))} disabled={!can('manage_settings')} />
                {can('manage_settings') && (
                  <div className={styles.priceActions}>
                    <Button size="sm" variant="secondary" onClick={() => handleSavePrice(p)}>Save</Button>
                    <Button size="sm" variant="danger" onClick={() => handleDeletePrice(p.id)}>Delete</Button>
                  </div>
                )}
              </div>
            ))}
            {can('manage_settings') && (
              <div className={styles.addPriceRow}>
                <FormField label="Size Name">
                  <Input placeholder="e.g. Jumbo, Bulk" value={newPrice.size} onChange={e => setNewPrice(p => ({ ...p, size: e.target.value }))} />
                </FormField>
                <FormField label="Price per Crate (₦)">
                  <Input type="number" min="0" placeholder="0" value={newPrice.price_per_crate} onChange={e => setNewPrice(p => ({ ...p, price_per_crate: e.target.value }))} />
                </FormField>
                <div style={{ paddingBottom: 1 }}>
                  <Button onClick={handleAddPrice}>+ Add Size</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Feed Settings */}
      <section className={styles.section}>
        <SectionHead icon="🌾" iconBg="#f0fdf4" iconColor="#16a34a" title="Feed Settings" desc="Configure how feed stock is calculated from purchases." />
        <div className={styles.sectionBody}>
          <div className={styles.farmGrid}>
            <FormField label="Kg per Bag">
              <Input type="number" min="1" step="0.1" placeholder="25" value={settings.feed_bag_kg || ''} onChange={e => setSettings(s => ({ ...s, feed_bag_kg: e.target.value }))} disabled={!can('manage_settings')} />
            </FormField>
          </div>
          {can('manage_settings') && (
            <div className={styles.saveRow}>
              <Button onClick={handleSaveSettings} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
              {saved && <span className={styles.savedMsg}>✓ Saved</span>}
            </div>
          )}
        </div>
      </section>

    </div>

    {confirmDelete && (
      <Modal
        title="Confirm Delete"
        onClose={() => setConfirmDelete(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleConfirmDelete}>Delete</Button>
          </>
        }
      >
        <p style={{ fontSize: 15, color: 'var(--color-text)', lineHeight: 1.6 }}>
          Are you sure you want to delete <strong>{confirmDelete.name}</strong>?
          {confirmDelete.type === 'flock' && (
            <span style={{ display: 'block', marginTop: 8, fontSize: 13, color: 'var(--color-text-secondary)' }}>
              Production and sales records linked to it will remain but show as "Unknown Flock".
            </span>
          )}
        </p>
      </Modal>
    )}
  )
}
