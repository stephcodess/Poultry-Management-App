import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useMonth } from '../utils/MonthContext'
import { useAuth } from '../utils/AuthContext'
import {
  formatDate, formatCurrency, toMonthYear,
  PAYMENT_METHODS, EXPENSE_CATEGORIES, STAFF_EXPENSE_CATEGORIES,
} from '../utils/format'
import Modal from '../components/common/Modal'
import Button from '../components/common/Button'
import FormField from '../components/common/FormField'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import styles from './Expenses.module.css'
import dayjs from 'dayjs'

const PIE_COLORS = [
  '#2563eb','#16a34a','#d97706','#dc2626','#7c3aed',
  '#0891b2','#be185d','#065f46','#92400e','#1e3a8a',
]

function loadCustomCategories() {
  try { const s = localStorage.getItem('expenseCustomCategories'); if (s) return JSON.parse(s) } catch {}
  return []
}
function saveCustomCategories(cats) { localStorage.setItem('expenseCustomCategories', JSON.stringify(cats)) }

function loadFeedTypes() {
  try { const s = localStorage.getItem('feedTypes'); if (s) return JSON.parse(s) } catch {}
  return ['Layers Mash', 'Layers Pellets', 'Broiler Starter', 'Broiler Finisher']
}
function saveFeedTypes(types) { localStorage.setItem('feedTypes', JSON.stringify(types)) }

const EMPTY_FORM = {
  date: dayjs().format('YYYY-MM-DD'),
  category: 'Feed',
  description: '',
  payment_method: 'Cash',
  amount: '',
  feed_type: '',
  quantity_kg: '',
  bags: '',
  supplier: '',
  staff_id: '',
}

function Input({ type = 'text', value, onChange, ...props }) {
  return (
    <input
      type={type} value={value} onChange={onChange}
      {...props}
      style={{
        width: '100%', boxSizing: 'border-box',
        border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
        padding: '10px 12px', fontSize: 15, outline: 'none',
        fontFamily: 'var(--font)', background: 'var(--color-surface)',
        color: 'var(--color-text)', ...props.style,
      }}
    />
  )
}

function Sel({ value, onChange, children, ...props }) {
  return (
    <select
      value={value} onChange={onChange}
      {...props}
      style={{
        width: '100%', boxSizing: 'border-box',
        border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
        padding: '10px 12px', fontSize: 15, outline: 'none',
        fontFamily: 'var(--font)', background: 'var(--color-surface)',
        color: 'var(--color-text)', cursor: 'pointer', ...props.style,
      }}
    >
      {children}
    </select>
  )
}

export default function Expenses() {
  const { monthYear } = useMonth()
  const { can } = useAuth()

  const [records, setRecords] = useState([])
  const [balance, setBalance] = useState(null)
  const [cashReceived, setCashReceived] = useState(0)
  const [staffList, setStaffList] = useState([])
  const [loading, setLoading] = useState(true)

  const [showModal, setShowModal] = useState(false)
  const [showBalanceModal, setShowBalanceModal] = useState(false)
  const [showCatModal, setShowCatModal] = useState(false)

  const [editRecord, setEditRecord] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [balanceDraft, setBalanceDraft] = useState('')
  const [balanceNotesDraft, setBalanceNotesDraft] = useState('')

  const [customCategories, setCustomCategories] = useState(loadCustomCategories)
  const [newCatName, setNewCatName] = useState('')
  const [feedTypes, setFeedTypes] = useState(loadFeedTypes)
  const [newFeedType, setNewFeedType] = useState('')
  const [addingFeedType, setAddingFeedType] = useState(false)
  const [bagKg, setBagKg] = useState(25)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [expRes, salesRes, balRes, dpRes, staffRes, cfgRes] = await Promise.all([
        supabase.from('expenses').select('*').eq('month_year', monthYear).order('date', { ascending: false }),
        supabase.from('sales').select('payment_status, crates, pieces, price_per_crate').eq('month_year', monthYear),
        supabase.from('monthly_balance').select('*').eq('month_year', monthYear).maybeSingle(),
        supabase.from('debt_payments').select('amount').eq('month_year', monthYear),
        supabase.from('staff').select('id, name, position, is_active').order('name'),
        supabase.from('settings').select('value').eq('key', 'feed_bag_kg').maybeSingle(),
      ])
      setRecords(expRes.data || [])
      const cashSales = (salesRes.data || [])
        .filter(r => !r.payment_status || r.payment_status === 'cash')
        .reduce((sum, r) => sum + ((r.crates || 0) + (r.pieces || 0) / 30) * (r.price_per_crate || 0), 0)
      const repayments = (dpRes.data || []).reduce((sum, r) => sum + (r.amount || 0), 0)
      setCashReceived(cashSales + repayments)
      setBalance(balRes.data || null)
      setStaffList(staffRes.data || [])
      if (cfgRes.data?.value) setBagKg(Number(cfgRes.data.value) || 25)
    } finally {
      setLoading(false)
    }
  }, [monthYear])

  useEffect(() => { load() }, [load])

  // ── Stats ────────────────────────────────────────────────────
  const openingBalance = balance?.opening_balance || 0
  const totalExpenses = records.reduce((s, r) => s + (r.amount || 0), 0)
  const totalCashIn = openingBalance + cashReceived
  const walletBalance = totalCashIn - totalExpenses
  const spentPct = totalCashIn > 0 ? Math.min((totalExpenses / totalCashIn) * 100, 100) : 0
  const isLow = walletBalance < totalCashIn * 0.2 && totalCashIn > 0

  const byCategory = records.reduce((acc, r) => {
    acc[r.category] = (acc[r.category] || 0) + (r.amount || 0)
    return acc
  }, {})
  const pieData = Object.entries(byCategory).map(([name, value]) => ({ name, value }))

  const staffMap = Object.fromEntries(staffList.map(s => [s.id, s]))
  const isStaffCategory = cat => STAFF_EXPENSE_CATEGORIES.includes(cat)

  // ── CRUD ─────────────────────────────────────────────────────
  function openAdd() {
    setEditRecord(null)
    setForm({ ...EMPTY_FORM, date: dayjs().format('YYYY-MM-DD') })
    setShowModal(true)
  }

  function openEdit(row) {
    setEditRecord(row)
    setForm({
      date: row.date, category: row.category, description: row.description || '',
      payment_method: row.payment_method || 'Cash', amount: String(row.amount ?? ''),
      feed_type: row.feed_type || '',
      quantity_kg: row.quantity_kg != null ? String(row.quantity_kg) : '',
      bags: row.bags != null ? String(row.bags) : '',
      supplier: row.supplier || '',
      staff_id: row.staff_id ? String(row.staff_id) : '',
    })
    setShowModal(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const isFeed = form.category === 'Feed'
      const needsStaff = isStaffCategory(form.category)
      const data = {
        date: form.date,
        month_year: toMonthYear(form.date),
        category: form.category,
        description: form.description || null,
        payment_method: form.payment_method,
        amount: Number(form.amount),
        feed_type: isFeed ? form.feed_type || null : null,
        quantity_kg: isFeed && form.quantity_kg ? Number(form.quantity_kg) : null,
        bags: isFeed && form.bags ? Number(form.bags) : null,
        supplier: isFeed ? form.supplier || null : null,
        staff_id: needsStaff && form.staff_id ? Number(form.staff_id) : null,
      }
      if (editRecord) await supabase.from('expenses').update(data).eq('id', editRecord.id)
      else await supabase.from('expenses').insert(data)
      setShowModal(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this expense?')) return
    await supabase.from('expenses').delete().eq('id', id)
    load()
  }

  async function handleSaveBalance() {
    await supabase.from('monthly_balance').upsert({
      month_year: monthYear,
      opening_balance: Number(balanceDraft) || 0,
      notes: balanceNotesDraft || null,
    }, { onConflict: 'month_year' })
    setShowBalanceModal(false)
    load()
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '60px 24px', color: 'var(--color-text-secondary)', fontSize: 14 }}>
      <div style={{ width: 20, height: 20, border: '2px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <span>Loading expenses…</span>
    </div>
  )

  const walletClass = walletBalance < 0 ? styles.walletNegative : isLow ? styles.walletLow : styles.walletHealthy

  return (
    <div className={styles.page}>
      {/* Top strip: wallet + category breakdown */}
      <div className={styles.topStrip}>
        {/* Wallet */}
        <div className={`${styles.walletBanner} ${walletClass}`}>
          <div className={styles.walletLeft}>
            <div className={styles.walletIcon}>{walletBalance < 0 ? '🔴' : isLow ? '🟡' : '💵'}</div>
            <div>
              <div className={styles.walletLabel}>Wallet Balance</div>
              <div className={styles.walletAmount} style={{ color: walletBalance < 0 ? '#dc2626' : isLow ? '#d97706' : '#16a34a' }}>
                {formatCurrency(walletBalance)}
              </div>
              <div className={styles.walletSub}>
                {walletBalance < 0 ? `Overspent by ${formatCurrency(Math.abs(walletBalance))}` : isLow ? 'Running low — less than 20% remaining' : 'Funds available this month'}
              </div>
            </div>
          </div>
          <div className={styles.walletRight}>
            <div className={styles.walletStat}>
              <span className={styles.walletStatLabel}>
                Opening Balance
                {can('manage_settings') && (
                  <button className={styles.editBalanceBtn} onClick={() => { setBalanceDraft(String(openingBalance)); setBalanceNotesDraft(balance?.notes || ''); setShowBalanceModal(true) }} title="Edit opening balance">✎</button>
                )}
              </span>
              <span className={styles.walletStatValue}>{formatCurrency(openingBalance)}</span>
            </div>
            <div className={styles.walletStat}>
              <span className={styles.walletStatLabel}>+ Cash Received</span>
              <span className={styles.walletStatValue} style={{ color: '#16a34a' }}>{formatCurrency(cashReceived)}</span>
            </div>
            <div className={styles.walletStat}>
              <span className={styles.walletStatLabel}>Total Cash In</span>
              <span className={styles.walletStatValue}>{formatCurrency(totalCashIn)}</span>
            </div>
            <div className={styles.walletStat}>
              <span className={styles.walletStatLabel}>− Expenses</span>
              <span className={styles.walletStatValue} style={{ color: '#dc2626' }}>{formatCurrency(totalExpenses)}</span>
            </div>
          </div>
          <div className={styles.walletProgress}>
            <div className={styles.walletProgressTrack}>
              <div className={styles.walletProgressFill} style={{ width: `${spentPct}%`, background: walletBalance < 0 ? '#dc2626' : isLow ? '#d97706' : '#16a34a' }} />
            </div>
            <div className={styles.walletProgressLabel}>
              <span>{spentPct.toFixed(0)}% spent</span>
              <span>{(100 - spentPct).toFixed(0)}% remaining</span>
            </div>
          </div>
        </div>

        {/* Category breakdown */}
        <div className={styles.breakdownCard}>
          <div className={styles.sectionTitle}>By Category</div>
          {pieData.length === 0
            ? <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>No expenses yet this month.</p>
            : (
              <div className={styles.breakdownBody}>
                <div className={styles.categoryList}>
                  {pieData.map((c, i) => (
                    <div key={c.name} className={styles.categoryItem}>
                      <div className={styles.categoryDot} style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className={styles.categoryName}>{c.name}</span>
                      <div className={styles.categoryBar}>
                        <div className={styles.categoryBarFill} style={{ width: `${totalExpenses > 0 ? (c.value / totalExpenses) * 100 : 0}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      </div>
                      <span className={styles.categoryPct}>{totalExpenses > 0 ? ((c.value / totalExpenses) * 100).toFixed(0) : 0}%</span>
                      <span className={styles.categoryAmount}>{formatCurrency(c.value)}</span>
                    </div>
                  ))}
                </div>
                <div className={styles.pieWrap}>
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3}>
                        {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />)}
                      </Pie>
                      <Tooltip formatter={v => formatCurrency(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )
          }
        </div>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        {can('write') && <Button onClick={openAdd}>+ Add Expense</Button>}
        <span className={styles.recordCount}>{records.length} record{records.length !== 1 ? 's' : ''} this month</span>
      </div>

      {/* Records */}
      <div className={styles.tableWrapper}>
        {records.length === 0
          ? <div className={styles.empty}>No expenses recorded for this month.</div>
          : records.map(row => {
            const catIdx = pieData.findIndex(p => p.name === row.category)
            const catColor = PIE_COLORS[catIdx % PIE_COLORS.length] || '#6b7280'
            const staff = row.staff_id ? staffMap[row.staff_id] : null
            let desc = row.description
            if (row.category === 'Feed' && (row.feed_type || row.quantity_kg)) {
              const parts = []
              if (row.feed_type) parts.push(row.feed_type)
              if (row.bags) parts.push(`${row.bags} bags`)
              if (row.quantity_kg) parts.push(`${row.quantity_kg} kg`)
              if (row.supplier) parts.push(`from ${row.supplier}`)
              desc = parts.join(' · ') || row.description
            }
            return (
              <div key={row.id} className={styles.expCard}>
                <div className={styles.expCardTop}>
                  <div className={styles.expCardLeft}>
                    <span className={styles.catBadge} style={{ background: catColor + '1a', color: catColor }}>{row.category}</span>
                    <span className={styles.expDate}>{formatDate(row.date)}</span>
                    <span className={styles.payBadge}>{row.payment_method || 'Cash'}</span>
                    {staff && <span className={styles.staffBadge}>{staff.name}</span>}
                  </div>
                  <div className={styles.expCardRight}>
                    <span className={styles.amountCell}>{formatCurrency(row.amount)}</span>
                    {can('write') && (
                      <div className={styles.actionBtns}>
                        <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>Edit</Button>
                        <Button size="sm" variant="danger" onClick={() => handleDelete(row.id)}>Del</Button>
                      </div>
                    )}
                  </div>
                </div>
                {desc && <div className={styles.expDesc}>{desc}</div>}
              </div>
            )
          })
        }
      </div>

      {/* Add/Edit Expense Modal */}
      {showModal && (
        <Modal title={editRecord ? 'Edit Expense' : 'Add Expense'} onClose={() => setShowModal(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </>
          }
        >
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.formGrid}>
              <FormField label="Date">
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
              </FormField>
              <FormField label={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Category</span>
                  <button type="button"
                    onClick={() => { setNewCatName(''); setShowCatModal(true) }}
                    style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: '#2563eb', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontFamily: 'var(--font)' }}
                  >+ Add Category</button>
                </div>
              }>
                <Sel value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value, staff_id: '' }))}>
                  <optgroup label="General">
                    {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                  {customCategories.filter(c => !EXPENSE_CATEGORIES.includes(c)).length > 0 && (
                    <optgroup label="Custom">
                      {customCategories.filter(c => !EXPENSE_CATEGORIES.includes(c)).map(c => <option key={c} value={c}>{c}</option>)}
                    </optgroup>
                  )}
                </Sel>
              </FormField>
              <FormField label="Description">
                <Input type="text" placeholder="What was this expense for?" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </FormField>
              <FormField label="Payment Method">
                <Sel value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </Sel>
              </FormField>
              {isStaffCategory(form.category) && (
                <FormField label="Staff Member" hint="Select the staff this expense is for">
                  <Sel value={form.staff_id} onChange={e => setForm(f => ({ ...f, staff_id: e.target.value }))}>
                    <option value="">— Select staff —</option>
                    {staffList.filter(s => s.is_active).map(s => (
                      <option key={s.id} value={String(s.id)}>{s.name}{s.position ? ` (${s.position})` : ''}</option>
                    ))}
                  </Sel>
                </FormField>
              )}
              <FormField label="Amount (₦)">
                <Input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
              </FormField>
            </div>

            {form.category === 'Feed' && (
              <>
                <div className={styles.sectionDivider}>Feed Purchase Details</div>
                <div className={styles.formGrid}>
                  <FormField label="Feed Type">
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Sel value={form.feed_type} onChange={e => setForm(f => ({ ...f, feed_type: e.target.value }))} style={{ flex: 1 }}>
                        <option value="">— Select type —</option>
                        {feedTypes.map(t => <option key={t} value={t}>{t}</option>)}
                      </Sel>
                      <button type="button" title="Add feed type"
                        onClick={() => { setAddingFeedType(true); setNewFeedType('') }}
                        style={{ flexShrink: 0, height: 44, width: 44, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >+</button>
                    </div>
                    {addingFeedType && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <input autoFocus type="text" placeholder="New feed type" value={newFeedType}
                          onChange={e => setNewFeedType(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              const t = newFeedType.trim()
                              if (t && !feedTypes.includes(t)) { const u = [...feedTypes, t]; setFeedTypes(u); saveFeedTypes(u); setForm(f => ({ ...f, feed_type: t })) }
                              setAddingFeedType(false); setNewFeedType('')
                            }
                            if (e.key === 'Escape') { setAddingFeedType(false); setNewFeedType('') }
                          }}
                          style={{ flex: 1, border: '1.5px solid var(--color-primary)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 15, outline: 'none', fontFamily: 'var(--font)' }}
                        />
                        <button type="button"
                          onClick={() => { const t = newFeedType.trim(); if (t && !feedTypes.includes(t)) { const u = [...feedTypes, t]; setFeedTypes(u); saveFeedTypes(u); setForm(f => ({ ...f, feed_type: t })) } setAddingFeedType(false); setNewFeedType('') }}
                          style={{ height: 44, padding: '0 14px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}
                        >Add</button>
                        <button type="button" onClick={() => { setAddingFeedType(false); setNewFeedType('') }}
                          style={{ height: 44, padding: '0 12px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 'var(--radius-sm)', fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font)' }}
                        >✕</button>
                      </div>
                    )}
                  </FormField>
                  <FormField label={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>Bags</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '1px 8px' }}>1 bag = {bagKg} kg</span>
                    </div>
                  }>
                    <Input type="number" min="0" step="1" placeholder="e.g. 10" value={form.bags}
                      onChange={e => {
                        const bags = e.target.value
                        setForm(f => ({ ...f, bags, quantity_kg: bags && !f._kgManual ? String(Math.round(Number(bags) * bagKg * 10) / 10) : f.quantity_kg }))
                      }} />
                  </FormField>
                  <FormField label="Quantity (kg)" hint="Auto-filled from bags. Edit to override.">
                    <Input type="number" min="0" step="0.1" placeholder="e.g. 250" value={form.quantity_kg}
                      onChange={e => setForm(f => ({ ...f, quantity_kg: e.target.value, _kgManual: true }))} />
                  </FormField>
                  <FormField label="Supplier">
                    <Input type="text" placeholder="Supplier name" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} />
                  </FormField>
                </div>
              </>
            )}

            {form.amount && (
              <div className={styles.preview}>
                Wallet after this: <strong style={{ color: walletBalance - Number(form.amount) < 0 ? '#dc2626' : '#16a34a' }}>
                  {formatCurrency(walletBalance - Number(form.amount))}
                </strong>
              </div>
            )}
          </form>
        </Modal>
      )}

      {/* Opening Balance Modal */}
      {showBalanceModal && (
        <Modal title="Edit Opening Balance" onClose={() => setShowBalanceModal(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowBalanceModal(false)}>Cancel</Button>
              <Button onClick={handleSaveBalance}>Save</Button>
            </>
          }
        >
          <div className={styles.form}>
            <FormField label="Opening Balance (₦)" hint="Cash available at the start of this month.">
              <Input type="number" min="0" step="0.01" value={balanceDraft} onChange={e => setBalanceDraft(e.target.value)} autoFocus />
            </FormField>
            <FormField label="Notes (optional)">
              <Input type="text" placeholder="e.g. Carried over from previous month" value={balanceNotesDraft} onChange={e => setBalanceNotesDraft(e.target.value)} />
            </FormField>
          </div>
        </Modal>
      )}

      {/* Manage Categories Modal */}
      {showCatModal && (
        <Modal title="Manage Expense Categories" onClose={() => setShowCatModal(false)}
          footer={<Button onClick={() => setShowCatModal(false)}>Done</Button>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
              Built-in categories cannot be removed. You can add custom categories below.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {EXPENSE_CATEGORIES.map(c => (
                <span key={c} style={{ background: '#f1f5f9', color: '#475569', borderRadius: 20, padding: '4px 12px', fontSize: 13, fontWeight: 500 }}>{c}</span>
              ))}
            </div>
            {customCategories.filter(c => !EXPENSE_CATEGORIES.includes(c)).length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Custom Categories</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {customCategories.filter(c => !EXPENSE_CATEGORIES.includes(c)).map(c => (
                    <span key={c} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 20, padding: '4px 10px 4px 12px', fontSize: 13, fontWeight: 500 }}>
                      {c}
                      <button onClick={() => { const u = customCategories.filter(x => x !== c); setCustomCategories(u); saveCustomCategories(u) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#93c5fd', fontSize: 14, lineHeight: 1, padding: 0 }}
                      >✕</button>
                    </span>
                  ))}
                </div>
              </>
            )}
            <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>Add New Category</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" placeholder="e.g. Pension, Allowance, Loan" value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const t = newCatName.trim()
                    if (t && !EXPENSE_CATEGORIES.includes(t) && !customCategories.includes(t)) {
                      const u = [...customCategories, t]; setCustomCategories(u); saveCustomCategories(u); setNewCatName('')
                    }
                  }
                }}
                style={{ flex: 1, border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', fontFamily: 'var(--font)' }}
              />
              <button
                onClick={() => {
                  const t = newCatName.trim()
                  if (t && !EXPENSE_CATEGORIES.includes(t) && !customCategories.includes(t)) {
                    const u = [...customCategories, t]; setCustomCategories(u); saveCustomCategories(u); setNewCatName('')
                  }
                }}
                style={{ height: 44, padding: '0 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}
              >Add</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
