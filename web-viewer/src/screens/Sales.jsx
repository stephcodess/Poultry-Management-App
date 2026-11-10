import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useMonth } from '../utils/MonthContext'
import { useAuth } from '../utils/AuthContext'
import {
  formatDate, formatCurrency, formatEggs, toMonthYear,
  OTHER_INCOME_CATEGORIES, PAYMENT_METHODS,
} from '../utils/format'
import Modal from '../components/common/Modal'
import Button from '../components/common/Button'
import FormField from '../components/common/FormField'
import styles from './Sales.module.css'
import dayjs from 'dayjs'

const EMPTY_SALES_FORM = {
  date: dayjs().format('YYYY-MM-DD'),
  egg_size: '',
  price_per_crate: '',
  flock_id: '',
  crates: '',
  pieces: '',
  payment_status: 'cash',
  credit_customer_id: '',
  buyer_name: '',
  amount_paid_now: '',
}

const EMPTY_DOM_FORM = {
  date: dayjs().format('YYYY-MM-DD'),
  location: '',
  crates: '',
  pieces: '',
  flock_id: '',
}

const EMPTY_INCOME_FORM = {
  date: dayjs().format('YYYY-MM-DD'),
  category: OTHER_INCOME_CATEGORIES[0],
  description: '',
  amount: '',
  payment_method: 'Cash',
}

function loadIncomeCategories() {
  try { const s = localStorage.getItem('incomeCustomCategories'); if (s) return JSON.parse(s) } catch {}
  return []
}
function saveIncomeCategories(cats) { localStorage.setItem('incomeCustomCategories', JSON.stringify(cats)) }

function Input({ type = 'text', value, onChange, ...props }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
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

function Select({ value, onChange, children, ...props }) {
  return (
    <select
      value={value}
      onChange={onChange}
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

export default function Sales() {
  const { monthYear } = useMonth()
  const { can } = useAuth()

  const [sales, setSales] = useState([])
  const [domestic, setDomestic] = useState([])
  const [prices, setPrices] = useState([])
  const [flocks, setFlocks] = useState([])
  const [customers, setCustomers] = useState([])
  const [otherIncomeList, setOtherIncomeList] = useState([])
  const [activeTab, setActiveTab] = useState('sales')
  const [loading, setLoading] = useState(true)

  const [showSalesModal, setShowSalesModal] = useState(false)
  const [showDomModal, setShowDomModal] = useState(false)
  const [showIncomeModal, setShowIncomeModal] = useState(false)
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false)

  const [editSales, setEditSales] = useState(null)
  const [editDom, setEditDom] = useState(null)
  const [editIncome, setEditIncome] = useState(null)

  const [salesForm, setSalesForm] = useState(EMPTY_SALES_FORM)
  const [domForm, setDomForm] = useState(EMPTY_DOM_FORM)
  const [incomeForm, setIncomeForm] = useState(EMPTY_INCOME_FORM)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')

  const [incomeCustomCats, setIncomeCustomCats] = useState(loadIncomeCategories)
  const [newIncomeCat, setNewIncomeCat] = useState('')
  const [addingIncomeCat, setAddingIncomeCat] = useState(false)

  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterPayment, setFilterPayment] = useState('')
  const [filterSize, setFilterSize] = useState('')
  const [filterFlock, setFilterFlock] = useState('')

  const [debtExpanded, setDebtExpanded] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [salesRes, domRes, pricesRes, flocksRes, custRes, incomeRes] = await Promise.all([
        supabase.from('sales')
          .select('*, flocks(name, color), credit_sales!credit_sale_id(id, status, amount_owed, amount_paid, customer_id)')
          .eq('month_year', monthYear)
          .order('date', { ascending: false }),
        supabase.from('domestic_usage')
          .select('*, flocks(name)')
          .eq('month_year', monthYear)
          .order('date', { ascending: false }),
        supabase.from('egg_prices').select('*').order('id'),
        supabase.from('flocks').select('*').neq('is_active', 0).order('name'),
        supabase.from('credit_customers').select('*').neq('is_active', 0).order('name'),
        supabase.from('other_income')
          .select('*')
          .eq('month_year', monthYear)
          .order('date', { ascending: false }),
      ])
      setSales(salesRes.data || [])
      setDomestic(domRes.data || [])
      setPrices(pricesRes.data || [])
      setFlocks(flocksRes.data || [])
      setCustomers(custRes.data || [])
      setOtherIncomeList(incomeRes.data || [])
    } finally {
      setLoading(false)
    }
  }, [monthYear])

  useEffect(() => { load() }, [load])

  // ── Computed stats ──────────────────────────────────────────
  const grossRevenue = sales.reduce((s, r) => s + ((r.crates || 0) + (r.pieces || 0) / 30) * (r.price_per_crate || 0), 0)
  const totalCrates = sales.reduce((s, r) => s + (r.crates || 0), 0)
  const totalPieces = sales.reduce((s, r) => s + (r.pieces || 0), 0)
  const totalDomEggs = domestic.reduce((s, d) => s + (d.crates * 30 + d.pieces), 0)
  const creditSalesCount = sales.filter(r => r.payment_status === 'credit' && r.credit_sales?.status === 'unpaid').length
  const totalOtherIncome = otherIncomeList.reduce((s, r) => s + (r.amount || 0), 0)

  const debtors = customers.filter(c => (c.outstanding || 0) > 0)
  const totalOutstanding = debtors.reduce((sum, c) => sum + (c.outstanding || 0), 0)

  // ── Filters ─────────────────────────────────────────────────
  const hasFilters = filterDateFrom || filterDateTo || filterPayment || filterSize || filterFlock
  const eggSizes = [...new Set(sales.map(s => s.egg_size).filter(Boolean))]

  const filteredSales = sales.filter(r => {
    if (filterDateFrom && r.date < filterDateFrom) return false
    if (filterDateTo && r.date > filterDateTo) return false
    if (filterSize && r.egg_size !== filterSize) return false
    if (filterFlock && String(r.flock_id) !== filterFlock) return false
    if (filterPayment) {
      const cs = r.credit_sales?.status
      if (filterPayment === 'cash' && r.payment_status !== 'cash') return false
      if (filterPayment === 'credit' && !(r.payment_status === 'credit' && cs === 'unpaid')) return false
      if (filterPayment === 'partial' && cs !== 'partial') return false
      if (filterPayment === 'paid' && !(r.payment_status === 'cash' || cs === 'paid')) return false
    }
    return true
  })

  function clearFilters() {
    setFilterDateFrom(''); setFilterDateTo('')
    setFilterPayment(''); setFilterSize(''); setFilterFlock('')
  }

  // ── Sales CRUD ───────────────────────────────────────────────
  function openAddSales() {
    setEditSales(null)
    const fp = prices[0]
    setSalesForm({ ...EMPTY_SALES_FORM, date: dayjs().format('YYYY-MM-DD'), egg_size: fp?.size || '', price_per_crate: fp?.price_per_crate || '', flock_id: flocks[0]?.id || '' })
    setShowSalesModal(true)
  }

  function openEditSales(row) {
    setEditSales(row)
    setSalesForm({
      date: row.date,
      egg_size: row.egg_size || '',
      price_per_crate: String(row.price_per_crate ?? ''),
      flock_id: row.flock_id || '',
      crates: String(row.crates ?? ''),
      pieces: String(row.pieces ?? ''),
      payment_status: row.payment_status || 'cash',
      credit_customer_id: row.credit_sales?.customer_id || '',
      buyer_name: row.buyer_name || '',
      amount_paid_now: '',
    })
    setShowSalesModal(true)
  }

  async function handleSalesSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const isCredit = salesForm.payment_status === 'credit'
      const data = {
        date: salesForm.date,
        month_year: toMonthYear(salesForm.date),
        egg_size: salesForm.egg_size,
        price_per_crate: Number(salesForm.price_per_crate),
        flock_id: salesForm.flock_id ? Number(salesForm.flock_id) : null,
        crates: Number(salesForm.crates),
        pieces: Number(salesForm.pieces),
        payment_status: salesForm.payment_status,
      }

      if (editSales) {
        await supabase.from('sales').update(data).eq('id', editSales.id)
        if (editSales.credit_sales?.id && !isCredit) {
          await supabase.from('credit_sales').delete().eq('id', editSales.credit_sales.id)
        }
      } else {
        const { data: inserted } = await supabase.from('sales').insert(data).select().single()
        if (isCredit && salesForm.credit_customer_id && inserted) {
          const totalRevenue = (Number(salesForm.crates) + Number(salesForm.pieces || 0) / 30) * Number(salesForm.price_per_crate)
          const deposit = Number(salesForm.amount_paid_now) || 0
          const amountOwed = Math.max(totalRevenue - deposit, 0)
          const { data: cs } = await supabase.from('credit_sales').insert({
            date: salesForm.date,
            month_year: toMonthYear(salesForm.date),
            customer_id: Number(salesForm.credit_customer_id),
            egg_size: salesForm.egg_size,
            price_per_crate: Number(salesForm.price_per_crate),
            crates: Number(salesForm.crates),
            pieces: Number(salesForm.pieces),
            amount_owed: amountOwed,
            amount_paid: deposit,
            status: deposit >= totalRevenue ? 'paid' : deposit > 0 ? 'partial' : 'unpaid',
          }).select().single()
          if (cs) {
            await supabase.from('sales').update({ credit_sale_id: cs.id }).eq('id', inserted.id)
            if (deposit > 0) {
              await supabase.from('debt_payments').insert({
                credit_sale_id: cs.id,
                customer_id: Number(salesForm.credit_customer_id),
                amount: deposit,
                date: salesForm.date,
                month_year: toMonthYear(salesForm.date),
              })
            }
          }
        }
      }
      setShowSalesModal(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteSales(row) {
    if (!confirm('Delete this sales record?')) return
    if (row.credit_sales?.id) {
      await supabase.from('credit_sales').delete().eq('id', row.credit_sales.id)
    }
    await supabase.from('sales').delete().eq('id', row.id)
    load()
  }

  // ── New Customer quick-add ───────────────────────────────────
  async function handleAddNewCustomer(e) {
    e.preventDefault()
    if (!newCustomerName.trim()) return
    const { data: nc } = await supabase.from('credit_customers').insert({
      name: newCustomerName.trim(), phone: newCustomerPhone.trim() || null, notes: null, is_active: true,
    }).select().single()
    const { data: updated } = await supabase.from('credit_customers').select('*').neq('is_active', 0).order('name')
    setCustomers(updated || [])
    if (nc) setSalesForm(f => ({ ...f, credit_customer_id: nc.id }))
    setNewCustomerName(''); setNewCustomerPhone('')
    setShowNewCustomerModal(false)
  }

  // ── Domestic CRUD ────────────────────────────────────────────
  function openAddDom() {
    setEditDom(null)
    setDomForm({ ...EMPTY_DOM_FORM, date: dayjs().format('YYYY-MM-DD'), flock_id: flocks[0]?.id || '' })
    setShowDomModal(true)
  }

  function openEditDom(row) {
    setEditDom(row)
    setDomForm({ date: row.date, location: row.location || '', crates: String(row.crates ?? ''), pieces: String(row.pieces ?? ''), flock_id: row.flock_id || '' })
    setShowDomModal(true)
  }

  async function handleDomSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const data = { date: domForm.date, month_year: toMonthYear(domForm.date), location: domForm.location || null, crates: Number(domForm.crates), pieces: Number(domForm.pieces), flock_id: domForm.flock_id ? Number(domForm.flock_id) : null }
      if (editDom) await supabase.from('domestic_usage').update(data).eq('id', editDom.id)
      else await supabase.from('domestic_usage').insert(data)
      setShowDomModal(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteDom(id) {
    if (!confirm('Delete this domestic usage record?')) return
    await supabase.from('domestic_usage').delete().eq('id', id)
    load()
  }

  // ── Other Income CRUD ────────────────────────────────────────
  function openAddIncome() {
    setEditIncome(null)
    setIncomeForm({ ...EMPTY_INCOME_FORM, date: dayjs().format('YYYY-MM-DD') })
    setShowIncomeModal(true)
  }

  function openEditIncome(row) {
    setEditIncome(row)
    setIncomeForm({ date: row.date, category: row.category, description: row.description || '', amount: String(row.amount ?? ''), payment_method: row.payment_method || 'Cash' })
    setShowIncomeModal(true)
  }

  async function handleIncomeSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const data = { date: incomeForm.date, month_year: toMonthYear(incomeForm.date), category: incomeForm.category, description: incomeForm.description || null, amount: Number(incomeForm.amount), payment_method: incomeForm.payment_method }
      if (editIncome) await supabase.from('other_income').update(data).eq('id', editIncome.id)
      else await supabase.from('other_income').insert(data)
      setShowIncomeModal(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteIncome(id) {
    if (!confirm('Delete this income record?')) return
    await supabase.from('other_income').delete().eq('id', id)
    load()
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '60px 24px', color: 'var(--color-text-secondary)', fontSize: 14 }}>
      <div style={{ width: 20, height: 20, border: '2px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <span>Loading sales…</span>
    </div>
  )

  return (
    <div className={styles.page}>
      {/* KPI Strip */}
      <div className={styles.kpiStrip}>
        <div className={styles.kpiMain}>
          <div className={styles.kpiIcon}>💰</div>
          <div>
            <div className={styles.kpiValue}>{formatCurrency(grossRevenue)}</div>
            <div className={styles.kpiLabel}>Gross Revenue</div>
          </div>
        </div>
        <div className={styles.kpiItem}>
          <div className={styles.kpiItemValue}>{totalCrates}</div>
          <div className={styles.kpiItemLabel}>Crates Sold</div>
        </div>
        {totalPieces > 0 && (
          <div className={styles.kpiItem}>
            <div className={styles.kpiItemValue}>{totalPieces}</div>
            <div className={styles.kpiItemLabel}>Loose Pieces</div>
          </div>
        )}
        <div className={styles.kpiItem}>
          <div className={styles.kpiItemValue}>{formatEggs(totalDomEggs)}</div>
          <div className={styles.kpiItemLabel}>Domestic Use</div>
        </div>
        {creditSalesCount > 0 && (
          <div className={styles.kpiItem}>
            <div className={styles.kpiItemValue} style={{ color: '#d97706' }}>{creditSalesCount}</div>
            <div className={styles.kpiItemLabel}>Credit Sales</div>
          </div>
        )}
        {totalOtherIncome > 0 && (
          <div className={styles.kpiItem}>
            <div className={styles.kpiItemValue} style={{ color: '#7c3aed' }}>{formatCurrency(totalOtherIncome)}</div>
            <div className={styles.kpiItemLabel}>Other Income</div>
          </div>
        )}
      </div>

      {/* Outstanding Debts Panel */}
      {debtors.length > 0 && (
        <div className={styles.debtPanel}>
          <button className={styles.debtPanelHeader} onClick={() => setDebtExpanded(x => !x)}>
            <div className={styles.debtPanelLeft}>
              <span className={styles.debtPanelIcon}>⚠️</span>
              <div>
                <div className={styles.debtPanelTitle}>Outstanding Debts</div>
                <div className={styles.debtPanelSub}>
                  {debtors.length} customer{debtors.length !== 1 ? 's' : ''} owe a total of <strong>{formatCurrency(totalOutstanding)}</strong>
                </div>
              </div>
            </div>
            <span className={styles.debtChevron}>{debtExpanded ? '▲' : '▼'}</span>
          </button>
          {debtExpanded && (
            <div className={styles.debtList}>
              {debtors.map(c => (
                <div key={c.id} className={styles.debtRow}>
                  <div className={styles.debtAvatar}>{c.name.charAt(0).toUpperCase()}</div>
                  <div className={styles.debtInfo}>
                    <div className={styles.debtName}>{c.name}</div>
                    {c.phone && <div className={styles.debtPhone}>{c.phone}</div>}
                  </div>
                  <div className={styles.debtRight}>
                    <div className={styles.debtAmount}>{formatCurrency(c.outstanding)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab Bar */}
      <div className={styles.tabBar}>
        {[
          { key: 'sales', icon: '🧾', label: 'Sales Records', count: sales.length },
          { key: 'domestic', icon: '🏠', label: 'Domestic Usage & Gifting', count: domestic.length },
          { key: 'otherIncome', icon: '💼', label: 'Other Income', count: otherIncomeList.length },
        ].map(t => (
          <button
            key={t.key}
            className={`${styles.tab} ${activeTab === t.key ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            <span className={styles.tabIcon}>{t.icon}</span>
            {t.label}
            {t.count > 0 && <span className={styles.tabCount}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className={styles.tabContent}>
        {/* ── Sales Tab ── */}
        {activeTab === 'sales' && (
          <>
            <div className={styles.toolbar}>
              {can('write') && <Button onClick={openAddSales}>+ Add Sale</Button>}
              <span className={styles.recordCount}>
                {hasFilters ? `${filteredSales.length} of ${sales.length} records` : `${sales.length} record${sales.length !== 1 ? 's' : ''} this month`}
              </span>
            </div>
            <div className={styles.filterBar}>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>From</label>
                <input type="date" className={styles.filterInput} value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
              </div>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>To</label>
                <input type="date" className={styles.filterInput} value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
              </div>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Payment</label>
                <select className={styles.filterInput} value={filterPayment} onChange={e => setFilterPayment(e.target.value)}>
                  <option value="">All</option>
                  <option value="cash">Cash</option>
                  <option value="credit">Credit (unpaid)</option>
                  <option value="partial">Part Paid</option>
                  <option value="paid">Fully Paid</option>
                </select>
              </div>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Egg Size</label>
                <select className={styles.filterInput} value={filterSize} onChange={e => setFilterSize(e.target.value)}>
                  <option value="">All Sizes</option>
                  {eggSizes.map(sz => <option key={sz} value={sz}>{sz}</option>)}
                </select>
              </div>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Flock</label>
                <select className={styles.filterInput} value={filterFlock} onChange={e => setFilterFlock(e.target.value)}>
                  <option value="">All Flocks</option>
                  {flocks.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              {hasFilters && <button className={styles.filterClear} onClick={clearFilters}>✕ Clear</button>}
            </div>

            <div className={styles.tableWrapper}>
              {filteredSales.length === 0
                ? <div className={styles.empty}>No sales match the selected filters.</div>
                : filteredSales.map(row => {
                  const cs = row.credit_sales
                  const customerName = customers.find(c => c.id === cs?.customer_id)?.name || row.buyer_name
                  const revenue = ((row.crates || 0) + (row.pieces || 0) / 30) * (row.price_per_crate || 0)
                  return (
                    <div key={row.id} className={styles.saleCard}>
                      <div className={styles.saleCardTop}>
                        <div className={styles.saleCardLeft}>
                          <span className={styles.sizeBadge}>{row.egg_size || '—'}</span>
                          <span className={styles.saleDate}>{formatDate(row.date)}</span>
                          {row.flocks && (
                            <span className={styles.flockBadge}>
                              {row.flocks.color && <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.flocks.color, display: 'inline-block', marginRight: 4 }} />}
                              {row.flocks.name}
                            </span>
                          )}
                        </div>
                        <div className={styles.saleCardRight}>
                          <span className={styles.revenueCell}>{formatCurrency(revenue)}</span>
                          <PayBadge row={row} cs={cs} customerName={customerName} />
                          {can('write') && (
                            <div className={styles.actionBtns}>
                              <Button size="sm" variant="secondary" onClick={() => openEditSales(row)}>Edit</Button>
                              <Button size="sm" variant="danger" onClick={() => handleDeleteSales(row)}>Del</Button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className={styles.saleCardDetails}>
                        <span>{row.crates} crates · {row.pieces} pcs · {formatCurrency(row.price_per_crate)}/crate</span>
                      </div>
                    </div>
                  )
                })
              }
            </div>
          </>
        )}

        {/* ── Domestic Tab ── */}
        {activeTab === 'domestic' && (
          <>
            <div className={styles.toolbar}>
              {can('write') && <Button onClick={openAddDom}>+ Add Usage</Button>}
              <span className={styles.recordCount}>{domestic.length} record{domestic.length !== 1 ? 's' : ''} this month</span>
            </div>
            <div className={styles.tableWrapper}>
              {domestic.length === 0
                ? <div className={styles.empty}>No domestic usage recorded.</div>
                : domestic.map(row => (
                  <div key={row.id} className={styles.saleCard}>
                    <div className={styles.saleCardTop}>
                      <div className={styles.saleCardLeft}>
                        <span className={styles.saleDate}>{formatDate(row.date)}</span>
                        <span className={styles.locationText}>{row.location || <span style={{ color: '#9ca3af' }}>—</span>}</span>
                        {row.flocks?.name && <span className={styles.flockBadge}>{row.flocks.name}</span>}
                      </div>
                      <div className={styles.saleCardRight}>
                        <span className={styles.eggCount}>{formatEggs(row.crates * 30 + row.pieces)}</span>
                        {can('write') && (
                          <div className={styles.actionBtns}>
                            <Button size="sm" variant="secondary" onClick={() => openEditDom(row)}>Edit</Button>
                            <Button size="sm" variant="danger" onClick={() => handleDeleteDom(row.id)}>Del</Button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className={styles.saleCardDetails}>
                      <span>{row.crates} crates · {row.pieces} pcs</span>
                    </div>
                  </div>
                ))
              }
            </div>
          </>
        )}

        {/* ── Other Income Tab ── */}
        {activeTab === 'otherIncome' && (
          <>
            <div className={styles.toolbar}>
              {can('write') && <Button onClick={openAddIncome}>+ Add Income</Button>}
              <span className={styles.recordCount}>{otherIncomeList.length} record{otherIncomeList.length !== 1 ? 's' : ''} this month</span>
            </div>
            <div className={styles.tableWrapper}>
              {otherIncomeList.length === 0
                ? <div className={styles.empty}>No other income recorded for this month.</div>
                : otherIncomeList.map(row => (
                  <div key={row.id} className={styles.saleCard}>
                    <div className={styles.saleCardTop}>
                      <div className={styles.saleCardLeft}>
                        <span className={styles.catBadge}>{row.category}</span>
                        <span className={styles.saleDate}>{formatDate(row.date)}</span>
                        <span className={styles.payMethodBadge}>{row.payment_method}</span>
                      </div>
                      <div className={styles.saleCardRight}>
                        <span className={styles.incomeAmount}>{formatCurrency(row.amount)}</span>
                        {can('write') && (
                          <div className={styles.actionBtns}>
                            <Button size="sm" variant="secondary" onClick={() => openEditIncome(row)}>Edit</Button>
                            <Button size="sm" variant="danger" onClick={() => handleDeleteIncome(row.id)}>Del</Button>
                          </div>
                        )}
                      </div>
                    </div>
                    {row.description && <div className={styles.saleCardDetails}><span>{row.description}</span></div>}
                  </div>
                ))
              }
            </div>
          </>
        )}
      </div>

      {/* ── Sales Modal ── */}
      {showSalesModal && (
        <Modal title={editSales ? 'Edit Sale' : 'Add Sale'} onClose={() => setShowSalesModal(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowSalesModal(false)}>Cancel</Button>
              <Button onClick={handleSalesSubmit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </>
          }
        >
          <form onSubmit={handleSalesSubmit} className={styles.form}>
            <div className={styles.payToggleRow}>
              <span className={styles.payToggleLabel}>Payment Type</span>
              <div className={styles.payToggle}>
                <button type="button"
                  className={`${styles.payToggleBtn} ${salesForm.payment_status === 'cash' ? styles.payToggleBtnActive : ''}`}
                  onClick={() => setSalesForm(f => ({ ...f, payment_status: 'cash', credit_customer_id: '' }))}
                >💵 Cash</button>
                <button type="button"
                  className={`${styles.payToggleBtn} ${salesForm.payment_status === 'credit' ? styles.payToggleBtnCredit : ''}`}
                  onClick={() => setSalesForm(f => ({ ...f, payment_status: 'credit' }))}
                >📋 Credit</button>
              </div>
            </div>

            {salesForm.payment_status === 'credit' && (
              <div className={styles.customerRow}>
                <FormField label="Customer (Debtor)" style={{ flex: 1 }}>
                  <Select value={salesForm.credit_customer_id}
                    onChange={e => setSalesForm(f => ({ ...f, credit_customer_id: e.target.value }))}
                    required>
                    <option value="">— Select customer —</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}{(c.outstanding || 0) > 0 ? ` (owes ${formatCurrency(c.outstanding)})` : ''}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <button type="button" className={styles.newCustomerBtn}
                  onClick={() => setShowNewCustomerModal(true)}>+ New</button>
              </div>
            )}

            <div className={styles.formGrid}>
              <FormField label="Date">
                <Input type="date" value={salesForm.date} onChange={e => setSalesForm(f => ({ ...f, date: e.target.value }))} required />
              </FormField>
              <FormField label="Flock">
                <Select value={salesForm.flock_id} onChange={e => setSalesForm(f => ({ ...f, flock_id: e.target.value }))}>
                  <option value="">— Select flock —</option>
                  {flocks.map(fk => <option key={fk.id} value={fk.id}>{fk.name}</option>)}
                </Select>
              </FormField>
              <FormField label="Egg Size">
                <Select value={salesForm.egg_size}
                  onChange={e => {
                    const size = e.target.value
                    const matched = prices.find(p => p.size === size)
                    setSalesForm(f => ({ ...f, egg_size: size, price_per_crate: matched ? String(matched.price_per_crate) : f.price_per_crate }))
                  }}
                  required>
                  <option value="">— Select size —</option>
                  {prices.map(p => <option key={p.id} value={p.size}>{p.size}</option>)}
                </Select>
              </FormField>
              <FormField label="Price per Crate (₦)">
                <Input type="number" min="0" value={salesForm.price_per_crate} onChange={e => setSalesForm(f => ({ ...f, price_per_crate: e.target.value }))} required />
              </FormField>
              <FormField label="Crates">
                <Input type="number" min="0" value={salesForm.crates} onChange={e => setSalesForm(f => ({ ...f, crates: e.target.value }))} required />
              </FormField>
              <FormField label="Pieces (loose, 0–29)">
                <Input type="number" min="0" max="29" value={salesForm.pieces} onChange={e => setSalesForm(f => ({ ...f, pieces: e.target.value }))} required />
              </FormField>
            </div>

            {salesForm.payment_status === 'credit' && (
              <FormField label="Deposit / Amount Paid Now (₦)" hint="Leave as 0 if nothing was paid upfront.">
                <Input type="number" min="0" step="0.01" placeholder="0" value={salesForm.amount_paid_now}
                  onChange={e => setSalesForm(f => ({ ...f, amount_paid_now: e.target.value }))} />
              </FormField>
            )}

            {salesForm.crates !== '' && salesForm.price_per_crate !== '' && (() => {
              const totalRevenue = (Number(salesForm.crates) + Number(salesForm.pieces || 0) / 30) * Number(salesForm.price_per_crate)
              const deposit = Number(salesForm.amount_paid_now) || 0
              const outstanding = totalRevenue - deposit
              const isCredit = salesForm.payment_status === 'credit'
              return (
                <div className={styles.preview}>
                  <div>Revenue: <strong>{formatCurrency(totalRevenue)}</strong> &nbsp;·&nbsp; {Number(salesForm.crates) * 30 + Number(salesForm.pieces || 0)} eggs</div>
                  {isCredit && (
                    <div className={styles.previewCreditBreakdown}>
                      {deposit > 0 && <span className={styles.previewPaid}>Paid now: {formatCurrency(deposit)}</span>}
                      <span className={styles.previewOwed}>Outstanding debt: {formatCurrency(Math.max(outstanding, 0))}</span>
                    </div>
                  )}
                </div>
              )
            })()}
          </form>
        </Modal>
      )}

      {/* ── New Customer Modal ── */}
      {showNewCustomerModal && (
        <Modal title="New Customer" onClose={() => setShowNewCustomerModal(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowNewCustomerModal(false)}>Cancel</Button>
              <Button onClick={handleAddNewCustomer}>Add Customer</Button>
            </>
          }
        >
          <form onSubmit={handleAddNewCustomer} className={styles.form}>
            <div className={styles.formGrid}>
              <FormField label="Customer Name">
                <Input type="text" placeholder="Full name" value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} required />
              </FormField>
              <FormField label="Phone (optional)">
                <Input type="text" placeholder="Phone number" value={newCustomerPhone} onChange={e => setNewCustomerPhone(e.target.value)} />
              </FormField>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Domestic Modal ── */}
      {showDomModal && (
        <Modal title={editDom ? 'Edit Domestic Usage' : 'Add Domestic Usage'} onClose={() => setShowDomModal(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowDomModal(false)}>Cancel</Button>
              <Button onClick={handleDomSubmit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </>
          }
        >
          <form onSubmit={handleDomSubmit} className={styles.form}>
            <div className={styles.formGrid}>
              <FormField label="Date">
                <Input type="date" value={domForm.date} onChange={e => setDomForm(f => ({ ...f, date: e.target.value }))} required />
              </FormField>
              <FormField label="Flock">
                <Select value={domForm.flock_id} onChange={e => setDomForm(f => ({ ...f, flock_id: e.target.value }))}>
                  <option value="">— Select flock —</option>
                  {flocks.map(fk => <option key={fk.id} value={fk.id}>{fk.name}</option>)}
                </Select>
              </FormField>
              <FormField label="Location / Purpose">
                <Input type="text" placeholder="e.g. Kitchen, Gift to John" value={domForm.location} onChange={e => setDomForm(f => ({ ...f, location: e.target.value }))} />
              </FormField>
              <FormField label="Crates">
                <Input type="number" min="0" value={domForm.crates} onChange={e => setDomForm(f => ({ ...f, crates: e.target.value }))} required />
              </FormField>
              <FormField label="Pieces (loose)">
                <Input type="number" min="0" max="29" value={domForm.pieces} onChange={e => setDomForm(f => ({ ...f, pieces: e.target.value }))} required />
              </FormField>
            </div>
            {domForm.crates !== '' && (
              <div className={styles.preview}>
                Total: <strong>{Number(domForm.crates) * 30 + Number(domForm.pieces || 0)} eggs</strong>
              </div>
            )}
          </form>
        </Modal>
      )}

      {/* ── Other Income Modal ── */}
      {showIncomeModal && (
        <Modal title={editIncome ? 'Edit Income' : 'Add Other Income'} onClose={() => setShowIncomeModal(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowIncomeModal(false)}>Cancel</Button>
              <Button onClick={handleIncomeSubmit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </>
          }
        >
          <form onSubmit={handleIncomeSubmit} className={styles.form}>
            <div className={styles.formGrid}>
              <FormField label="Date">
                <Input type="date" value={incomeForm.date} onChange={e => setIncomeForm(f => ({ ...f, date: e.target.value }))} required />
              </FormField>
              <FormField label={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Category</span>
                  <button type="button"
                    onClick={() => { setNewIncomeCat(''); setAddingIncomeCat(true) }}
                    style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: '#2563eb', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontFamily: 'var(--font)' }}
                  >+ Add Category</button>
                </div>
              }>
                <Select value={incomeForm.category} onChange={e => setIncomeForm(f => ({ ...f, category: e.target.value }))}>
                  <optgroup label="Built-in">
                    {OTHER_INCOME_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                  {incomeCustomCats.length > 0 && (
                    <optgroup label="Custom">
                      {incomeCustomCats.map(c => <option key={c} value={c}>{c}</option>)}
                    </optgroup>
                  )}
                </Select>
                {addingIncomeCat && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input autoFocus type="text" placeholder="New category name"
                      value={newIncomeCat} onChange={e => setNewIncomeCat(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          const t = newIncomeCat.trim()
                          if (t && !OTHER_INCOME_CATEGORIES.includes(t) && !incomeCustomCats.includes(t)) {
                            const updated = [...incomeCustomCats, t]
                            setIncomeCustomCats(updated); saveIncomeCategories(updated)
                            setIncomeForm(f => ({ ...f, category: t }))
                          }
                          setAddingIncomeCat(false); setNewIncomeCat('')
                        }
                        if (e.key === 'Escape') { setAddingIncomeCat(false); setNewIncomeCat('') }
                      }}
                      style={{ flex: 1, border: '1.5px solid var(--color-primary)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 15, outline: 'none', fontFamily: 'var(--font)' }}
                    />
                    <button type="button"
                      onClick={() => {
                        const t = newIncomeCat.trim()
                        if (t && !OTHER_INCOME_CATEGORIES.includes(t) && !incomeCustomCats.includes(t)) {
                          const updated = [...incomeCustomCats, t]
                          setIncomeCustomCats(updated); saveIncomeCategories(updated)
                          setIncomeForm(f => ({ ...f, category: t }))
                        }
                        setAddingIncomeCat(false); setNewIncomeCat('')
                      }}
                      style={{ height: 48, padding: '0 16px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}
                    >Add</button>
                    <button type="button"
                      onClick={() => { setAddingIncomeCat(false); setNewIncomeCat('') }}
                      style={{ height: 48, padding: '0 14px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 'var(--radius-sm)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}
                    >✕</button>
                  </div>
                )}
              </FormField>
              <FormField label="Description">
                <Input type="text" placeholder="e.g. Loan from bank, sold old cages" value={incomeForm.description} onChange={e => setIncomeForm(f => ({ ...f, description: e.target.value }))} />
              </FormField>
              <FormField label="Payment Method">
                <Select value={incomeForm.payment_method} onChange={e => setIncomeForm(f => ({ ...f, payment_method: e.target.value }))}>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </Select>
              </FormField>
              <FormField label="Amount (₦)">
                <Input type="number" min="0" step="0.01" value={incomeForm.amount} onChange={e => setIncomeForm(f => ({ ...f, amount: e.target.value }))} required />
              </FormField>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function PayBadge({ row, cs, customerName }) {
  const customer = customerName ? ` · ${customerName}` : ''
  const base = { display: 'inline-block', borderRadius: 100, padding: '3px 10px', fontSize: 12, fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
  if (!row.payment_status || row.payment_status === 'cash') {
    return <span style={{ ...base, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>Cash</span>
  }
  if (cs?.status === 'paid') {
    return <span style={{ ...base, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }} title={customerName}>Paid{customer}</span>
  }
  if (cs?.status === 'partial') {
    return <span style={{ ...base, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }} title={customerName}>Part Paid{customer}</span>
  }
  return <span style={{ ...base, background: '#fff7ed', color: '#d97706', border: '1px solid #fed7aa' }} title={customerName}>Credit{customer}</span>
}
