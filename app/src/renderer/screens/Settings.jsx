import React, { useEffect, useState } from 'react'
import Button from '../components/common/Button'
import FormField, { Input, Select } from '../components/common/FormField'
import { useTourLauncher } from '../components/tour/TourGuide'
import styles from './Settings.module.css'

const FLOCK_COLORS = [
  '#2563eb', '#16a34a', '#d97706', '#dc2626',
  '#7c3aed', '#0891b2', '#be185d', '#059669',
  '#ea580c', '#0284c7',
]

function SectionHead({ icon, iconBg, iconColor, title, desc }) {
  return (
    <div className={styles.sectionHead}>
      <div className={styles.sectionIcon} style={{ background: iconBg, color: iconColor }}>
        {icon}
      </div>
      <div className={styles.sectionHeadText}>
        <div className={styles.sectionTitle}>{title}</div>
        {desc && <div className={styles.sectionDesc}>{desc}</div>}
      </div>
    </div>
  )
}

export default function Settings() {
  const [settings, setSettings] = useState({})
  const [prices, setPrices] = useState([])
  const [flocks, setFlocks] = useState([])
  const [newFlock, setNewFlock] = useState({ name: '', color: FLOCK_COLORS[0] })
  const [newPrice, setNewPrice] = useState({ size: '', price_per_crate: '' })
  const [saved, setSaved] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [lastSync, setLastSync] = useState(null)
  const launchTour = useTourLauncher()

  async function load() {
    const [s, p, f] = await Promise.all([
      window.api.settings.get(),
      window.api.settings.getPrices(),
      window.api.flocks.getAll(),
    ])
    setSettings(s)
    setPrices(p)
    setFlocks(f)
    const ls = await window.api.sync.getLastSync()
    setLastSync(ls)
  }

  useEffect(() => {
    load()
    window.api.sync.onAutoSyncComplete(result => {
      if (result.success) setLastSync(result.syncedAt)
    })
    return () => window.api.sync.offAutoSyncComplete()
  }, [])

  function flash() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function handleSaveSettings() {
    await window.api.settings.update(settings)
    flash()
  }

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    const result = await window.api.sync.toSupabase()
    if (result.success) {
      const iso = new Date().toISOString()
      await window.api.sync.saveLastSync(iso)
      setLastSync(iso)
      const total = Object.values(result.counts).reduce((s, n) => s + n, 0)
      setSyncResult({ ok: true, counts: result.counts, total })
    } else {
      setSyncResult({ ok: false, error: result.error })
    }
    setSyncing(false)
  }

  async function handleSavePrice(p) {
    await window.api.settings.updatePrice(p.id, { size: p.size, price_per_crate: Number(p.price_per_crate) })
    flash()
  }

  async function handleDeletePrice(id) {
    if (!confirm('Delete this egg size? This will not affect existing sales records.')) return
    await window.api.settings.deletePrice(id)
    load()
  }

  async function handleAddPrice() {
    if (!newPrice.size.trim()) return
    await window.api.settings.addPrice({ size: newPrice.size.trim(), price_per_crate: Number(newPrice.price_per_crate) || 0 })
    setNewPrice({ size: '', price_per_crate: '' })
    load()
  }

  function updateFlock(id, field, value) {
    setFlocks(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f))
  }

  async function handleSaveFlock(flock) {
    await window.api.flocks.update(flock.id, {
      name: flock.name,
      color: flock.color,
      is_active: flock.is_active,
      initial_bird_count: Number(flock.initial_bird_count) || 0,
      date_acquired: flock.date_acquired || null,
      breed: flock.breed || null,
      expected_lay_end: flock.expected_lay_end || null,
      target_yield_pct: Number(flock.target_yield_pct) || 80,
    })
    flash()
  }

  async function handleDeleteFlock(id) {
    if (!confirm('Delete this flock? Production and sales records linked to it will remain but show as "Unknown Flock".')) return
    await window.api.flocks.delete(id)
    load()
  }

  async function handleAddFlock() {
    if (!newFlock.name.trim()) return
    await window.api.flocks.add({ name: newFlock.name.trim(), color: newFlock.color })
    setNewFlock({ name: '', color: FLOCK_COLORS[0] })
    load()
  }

  return (
    <div className={styles.page}>

      {/* ── Farm Information ─────────────────────────────────────── */}
      <section className={styles.section}>
        <SectionHead
          icon="🏡"
          iconBg="#eff4ff"
          iconColor="#2563eb"
          title="Farm Information"
          desc="Basic details that appear on PDF reports and invoices."
        />
        <div className={styles.sectionBody}>
          <div className={styles.farmGrid}>
            <FormField label="Farm Name">
              <Input
                type="text"
                placeholder="e.g. Eldesign Poultry Farm"
                value={settings.farm_name || ''}
                onChange={e => setSettings(s => ({ ...s, farm_name: e.target.value }))}
              />
            </FormField>
            <FormField label="Farm Location">
              <Input
                type="text"
                placeholder="e.g. Osogbo, Osun State"
                value={settings.farm_location || ''}
                onChange={e => setSettings(s => ({ ...s, farm_location: e.target.value }))}
              />
            </FormField>
          </div>
          <div className={styles.saveRow}>
            <Button onClick={handleSaveSettings}>Save Changes</Button>
            {saved && <span className={styles.savedMsg}>✓ Saved</span>}
          </div>
        </div>
      </section>

      {/* ── Cloud Sync ───────────────────────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <SectionHead
          icon="☁️"
          iconBg="#f0f9ff"
          iconColor="#0284c7"
          title="Cloud Sync (Supabase)"
          desc="Sync your farm data to Supabase so it can be viewed on the web viewer app."
        />
        <div className={styles.sectionBody}>
          <div className={styles.saveRow}>
            <Button variant="secondary" onClick={handleSync} disabled={syncing}>
              {syncing ? 'Syncing…' : '☁ Sync Now'}
            </Button>
            {saved && <span className={styles.savedMsg}>✓ Saved</span>}
          </div>
          {syncing && (
            <div className={styles.syncStatus}>
              <div className={styles.syncSpinner} /> Pushing data to Supabase…
            </div>
          )}
          {syncResult && syncResult.ok && (
            <div className={styles.syncSuccess}>
              ✓ Synced {syncResult.total} rows successfully.
              <div className={styles.syncCounts}>
                {Object.entries(syncResult.counts).map(([t, n]) => (
                  <span key={t} className={styles.syncCount}>{t}: {n}</span>
                ))}
              </div>
            </div>
          )}
          {syncResult && !syncResult.ok && (
            <div className={styles.syncError} style={{ whiteSpace: 'pre-wrap' }}>{syncResult.error}</div>
          )}
          {lastSync && !syncing && (
            <div className={styles.lastSync}>Last synced: {new Date(lastSync).toLocaleString()}</div>
          )}
        </div>
      </section>

      {/* ── Flocks ───────────────────────────────────────────────── */}
      <section className={styles.section}>
        <SectionHead
          icon="🐓"
          iconBg="#f0fdf4"
          iconColor="#16a34a"
          title="Flocks"
          desc="Each flock tracks its own production, sales, and health history. Set lifecycle details to get retirement alerts."
        />
        <div className={styles.sectionBody}>
          <div className={styles.flockList}>
            {flocks.map(flock => {
              const retireSoon = flock.expected_lay_end &&
                new Date(flock.expected_lay_end) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
              return (
                <div key={flock.id} className={styles.flockCard}>
                  {/* Card title bar */}
                  <div className={styles.flockCardTop}>
                    <div className={styles.flockColorDot} style={{ background: flock.color, borderColor: flock.color + '55' }} />
                    <span className={styles.flockCardName}>{flock.name || '—'}</span>
                    {retireSoon && (
                      <span className={styles.retireSoonBadge}>⚠ Retiring soon</span>
                    )}
                    <span className={`${styles.flockStatusBadge} ${flock.is_active ? styles.active : styles.inactive}`}>
                      {flock.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {/* Editable fields */}
                  <div className={styles.flockCardBody}>
                    {/* Row 1: core fields */}
                    <div className={styles.flockRow1}>
                      <div>
                        <div className={styles.fieldLabel}>Flock Name</div>
                        <Input
                          value={flock.name}
                          onChange={e => updateFlock(flock.id, 'name', e.target.value)}
                        />
                      </div>
                      <div>
                        <div className={styles.fieldLabel}>Initial Birds</div>
                        <Input
                          type="number" min="0"
                          value={flock.initial_bird_count ?? ''}
                          onChange={e => updateFlock(flock.id, 'initial_bird_count', e.target.value)}
                        />
                      </div>
                      <div>
                        <div className={styles.fieldLabel}>Colour</div>
                        <div className={styles.colorPickerWrap}>
                          <input
                            type="color"
                            value={flock.color}
                            onChange={e => updateFlock(flock.id, 'color', e.target.value)}
                            className={styles.colorPicker}
                          />
                        </div>
                      </div>
                      <label className={styles.toggle}>
                        <input
                          type="checkbox"
                          checked={!!flock.is_active}
                          onChange={e => updateFlock(flock.id, 'is_active', e.target.checked ? 1 : 0)}
                        />
                        Active
                      </label>
                    </div>

                    {/* Row 2: lifecycle */}
                    <div className={styles.flockRow2}>
                      <div>
                        <div className={styles.fieldLabel}>Date Acquired</div>
                        <Input
                          type="date"
                          value={flock.date_acquired || ''}
                          onChange={e => updateFlock(flock.id, 'date_acquired', e.target.value)}
                        />
                      </div>
                      <div>
                        <div className={styles.fieldLabel}>Breed / Type</div>
                        <Input
                          type="text"
                          placeholder="e.g. ISA Brown, Shaver"
                          value={flock.breed || ''}
                          onChange={e => updateFlock(flock.id, 'breed', e.target.value)}
                        />
                      </div>
                      <div>
                        <div className={styles.fieldLabel}>Expected Retirement</div>
                        <Input
                          type="date"
                          value={flock.expected_lay_end || ''}
                          onChange={e => updateFlock(flock.id, 'expected_lay_end', e.target.value)}
                        />
                      </div>
                      <div>
                        <div className={styles.fieldLabel}>Target % Production</div>
                        <Input
                          type="number" min="1" max="100"
                          placeholder="80"
                          value={flock.target_yield_pct ?? 80}
                          onChange={e => updateFlock(flock.id, 'target_yield_pct', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Card footer: save / delete */}
                  <div className={styles.flockCardFooter}>
                    <Button size="sm" variant="danger" onClick={() => handleDeleteFlock(flock.id)}>
                      Delete Flock
                    </Button>
                    <Button size="sm" onClick={() => handleSaveFlock(flock)}>
                      Save Changes
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Add new flock */}
          <div className={styles.addPanel}>
            <div>
              <div className={styles.fieldLabel}>New Flock Name</div>
              <Input
                type="text"
                placeholder="e.g. Layer 3"
                value={newFlock.name}
                onChange={e => setNewFlock(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <div className={styles.fieldLabel}>Initial Birds</div>
              <Input
                type="number" min="0"
                placeholder="0"
                value={newFlock.initial_bird_count || ''}
                onChange={e => setNewFlock(f => ({ ...f, initial_bird_count: e.target.value }))}
              />
            </div>
            <div>
              <div className={styles.fieldLabel}>Colour</div>
              <div className={styles.colorPickerWrap}>
                <input
                  type="color"
                  value={newFlock.color}
                  onChange={e => setNewFlock(f => ({ ...f, color: e.target.value }))}
                  className={styles.colorPicker}
                />
              </div>
            </div>
            <div style={{ paddingTop: 18 }}>
              <Button onClick={handleAddFlock}>+ Add Flock</Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Egg Sizes & Prices ───────────────────────────────────── */}
      <section className={styles.section}>
        <SectionHead
          icon="🥚"
          iconBg="#fef9ec"
          iconColor="#d97706"
          title="Egg Sizes & Prices"
          desc="Default prices auto-fill when recording a sale. You can override per transaction."
        />
        <div className={styles.sectionBody}>
          <div className={styles.priceTable}>
            <div className={styles.priceTableHead}>
              <span>Size Name</span>
              <span>Price per Crate (₦)</span>
              <span></span>
            </div>
            {prices.map(p => (
              <div key={p.id} className={styles.priceRow}>
                <Input
                  value={p.size}
                  onChange={e => setPrices(prev => prev.map(x => x.id === p.id ? { ...x, size: e.target.value } : x))}
                />
                <Input
                  type="number" min="0"
                  value={p.price_per_crate}
                  onChange={e => setPrices(prev => prev.map(x => x.id === p.id ? { ...x, price_per_crate: e.target.value } : x))}
                />
                <div className={styles.priceActions}>
                  <Button size="sm" variant="secondary" onClick={() => handleSavePrice(p)}>Save</Button>
                  <Button size="sm" variant="danger" onClick={() => handleDeletePrice(p.id)}>Delete</Button>
                </div>
              </div>
            ))}
            <div className={styles.addPriceRow}>
              <FormField label="Size Name">
                <Input
                  type="text"
                  placeholder="e.g. Jumbo, Bulk"
                  value={newPrice.size}
                  onChange={e => setNewPrice(p => ({ ...p, size: e.target.value }))}
                />
              </FormField>
              <FormField label="Price per Crate (₦)">
                <Input
                  type="number" min="0"
                  placeholder="0"
                  value={newPrice.price_per_crate}
                  onChange={e => setNewPrice(p => ({ ...p, price_per_crate: e.target.value }))}
                />
              </FormField>
              <div style={{ paddingBottom: 1 }}>
                <Button onClick={handleAddPrice}>+ Add Size</Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feed Settings ────────────────────────────────────────── */}
      <section className={styles.section}>
        <SectionHead
          icon="🌾"
          iconBg="#f0fdf4"
          iconColor="#16a34a"
          title="Feed Settings"
          desc="Configure how feed stock is calculated from purchases."
        />
        <div className={styles.sectionBody}>
          <div className={styles.farmGrid}>
            <FormField label="Kg per Bag" hint="Used to estimate stock when only bags are recorded. Default is 25 kg.">
              <Input
                type="number"
                min="1"
                step="0.1"
                placeholder="25"
                value={settings.feed_bag_kg || ''}
                onChange={e => setSettings(s => ({ ...s, feed_bag_kg: e.target.value }))}
              />
            </FormField>
          </div>
          <div className={styles.saveRow}>
            <Button onClick={handleSaveSettings}>Save</Button>
            {saved && <span className={styles.savedMsg}>✓ Saved</span>}
          </div>
        </div>
      </section>

      {/* ── AI Assistant ─────────────────────────────────────────── */}
      <section className={styles.section}>
        <SectionHead
          icon="🤖"
          iconBg="#f0fdf4"
          iconColor="#16a34a"
          title="AI Assistant"
          desc="Add API keys for Gemini and/or OpenAI. Use 'Auto' to fall back to the other model when one is unavailable."
        />
        <div className={styles.sectionBody}>
          <div className={styles.farmGrid}>
            <FormField label="Gemini API Key" hint="Free at aistudio.google.com · 1,500 req/day, no credit card">
              <Input
                type="password"
                placeholder="Paste Gemini key here"
                value={settings.gemini_api_key || ''}
                onChange={e => setSettings(s => ({ ...s, gemini_api_key: e.target.value }))}
              />
            </FormField>
            <FormField label="OpenAI API Key" hint="platform.openai.com · Uses gpt-4o-mini (very cheap)">
              <Input
                type="password"
                placeholder="Paste OpenAI key here"
                value={settings.openai_api_key || ''}
                onChange={e => setSettings(s => ({ ...s, openai_api_key: e.target.value }))}
              />
            </FormField>
            <FormField label="Preferred Model">
              <Select
                value={settings.ai_model || 'auto'}
                onChange={e => setSettings(s => ({ ...s, ai_model: e.target.value }))}
              >
                <option value="auto">Auto (try Gemini first, fall back to OpenAI)</option>
                <option value="gemini">Gemini only</option>
                <option value="openai">OpenAI only</option>
              </Select>
            </FormField>
          </div>
          <div className={styles.saveRow}>
            <Button onClick={handleSaveSettings}>Save Keys</Button>
            {saved && <span className={styles.savedMsg}>✓ Saved</span>}
          </div>
        </div>
      </section>

      {/* ── App Help ─────────────────────────────────────────────── */}
      <section className={styles.section}>
        <SectionHead
          icon="🗺"
          iconBg="#f0f0ff"
          iconColor="#6d28d9"
          title="App Help"
          desc="Take the guided tour to re-learn any part of the app."
        />
        <div className={styles.sectionBody}>
          <div className={styles.helpRow}>
            <p className={styles.helpText}>
              The guided tour walks you through every screen — Dashboard, production logging, sales, expenses, and PDF export. Takes about 2 minutes.
            </p>
            <Button onClick={launchTour}>Relaunch Tour</Button>
          </div>
        </div>
      </section>

    </div>
  )
}
