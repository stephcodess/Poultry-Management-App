import React, { useEffect, useState, useCallback } from 'react'
import { useMonth } from '../utils/MonthContext'
import { formatDate, formatCurrency, formatEggs, toMonthYear } from '../utils/format'
import Table from '../components/common/Table'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import FormField, { Input, Select } from '../components/common/FormField'
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

export default function Sales() {
  const { monthYear } = useMonth()
  const [sales, setSales] = useState([])
  const [domestic, setDomestic] = useState([])
  const [summary, setSummary] = useState(null)
  const [prices, setPrices] = useState([])
  const [flocks, setFlocks] = useState([])
  const [customers, setCustomers] = useState([])
  const [activeTab, setActiveTab] = useState('sales')
  const [showSalesModal, setShowSalesModal] = useState(false)
  const [showDomModal, setShowDomModal] = useState(false)
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false)
  const [editSales, setEditSales] = useState(null)
  const [editDom, setEditDom] = useState(null)
  const [salesForm, setSalesForm] = useState(EMPTY_SALES_FORM)
  const [domForm, setDomForm] = useState(EMPTY_DOM_FORM)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')

  const load = useCallback(async () => {
    const [s, d, sm, p, f, c] = await Promise.all([
      window.api.sales.getAll(monthYear),
      window.api.domestic.getAll(monthYear),
      window.api.sales.getSummary(monthYear),
      window.api.settings.getPrices(),
      window.api.flocks.getAll(),
      window.api.debtors.getCustomers(),
    ])
    setSales(s)
    setDomestic(d)
    setSummary(sm)
    setPrices(p)
    setFlocks(f)
    setCustomers(c)
  }, [monthYear])

  useEffect(() => { load() }, [load])

  function openAddSales() {
    setEditSales(null)
    const firstPrice = prices[0]
    setSalesForm({
      ...EMPTY_SALES_FORM,
      egg_size: firstPrice?.size || '',
      price_per_crate: firstPrice?.price_per_crate || '',
      flock_id: flocks[0]?.id || '',
    })
    setShowSalesModal(true)
  }

  function openEditSales(row) {
    setEditSales(row)
    setSalesForm({
      date: row.date,
      egg_size: row.egg_size,
      price_per_crate: String(row.price_per_crate ?? ''),
      flock_id: row.flock_id,
      crates: String(row.crates ?? ''),
      pieces: String(row.pieces ?? ''),
      payment_status: row.payment_status || 'cash',
      credit_customer_id: row.credit_customer_id || '',
      buyer_name: row.buyer_name || '',
      credit_sale_id: row.credit_sale_id || null,
      amount_paid_now: '',
    })
    setShowSalesModal(true)
  }

  async function handleDeleteSales(id) {
    if (!confirm('Delete this sales record?')) return
    await window.api.sales.delete(id)
    load()
  }

  async function handleSalesSubmit(e) {
    e.preventDefault()
    const isCredit = salesForm.payment_status === 'credit'
    const data = {
      date: salesForm.date,
      month_year: toMonthYear(salesForm.date),
      egg_size: salesForm.egg_size,
      price_per_crate: Number(salesForm.price_per_crate),
      flock_id: Number(salesForm.flock_id),
      crates: Number(salesForm.crates),
      pieces: Number(salesForm.pieces),
      payment_status: salesForm.payment_status,
      credit_customer_id: isCredit && salesForm.credit_customer_id ? Number(salesForm.credit_customer_id) : null,
      buyer_name: salesForm.buyer_name || null,
      credit_sale_id: salesForm.credit_sale_id || null,
      amount_paid_now: isCredit ? (Number(salesForm.amount_paid_now) || 0) : 0,
    }
    if (editSales) {
      await window.api.sales.update(editSales.id, data)
    } else {
      await window.api.sales.add(data)
    }
    setShowSalesModal(false)
    load()
  }

  async function handleAddNewCustomer(e) {
    e.preventDefault()
    if (!newCustomerName.trim()) return
    const result = await window.api.debtors.addCustomer({ name: newCustomerName.trim(), phone: newCustomerPhone.trim(), notes: '' })
    const updated = await window.api.debtors.getCustomers()
    setCustomers(updated)
    setSalesForm(f => ({ ...f, credit_customer_id: result.id }))
    setNewCustomerName('')
    setNewCustomerPhone('')
    setShowNewCustomerModal(false)
  }

  function openAddDom() {
    setEditDom(null)
    setDomForm({ ...EMPTY_DOM_FORM, flock_id: flocks[0]?.id || '' })
    setShowDomModal(true)
  }

  function openEditDom(row) {
    setEditDom(row)
    setDomForm({
      date: row.date, location: row.location || '',
      crates: String(row.crates ?? ''), pieces: String(row.pieces ?? ''), flock_id: row.flock_id,
    })
    setShowDomModal(true)
  }

  async function handleDeleteDom(id) {
    if (!confirm('Delete this domestic usage record?')) return
    await window.api.domestic.delete(id)
    load()
  }

  async function handleDomSubmit(e) {
    e.preventDefault()
    const data = {
      date: domForm.date,
      month_year: toMonthYear(domForm.date),
      location: domForm.location,
      crates: Number(domForm.crates),
      pieces: Number(domForm.pieces),
      flock_id: Number(domForm.flock_id),
    }
    if (editDom) {
      await window.api.domestic.update(editDom.id, data)
    } else {
      await window.api.domestic.add(data)
    }
    setShowDomModal(false)
    load()
  }

  const grossRevenue = summary?.totals?.gross_revenue || 0
  const totalCrates = summary?.totals?.total_crates || 0
  const totalPieces = summary?.totals?.total_pieces || 0
  const totalDomEggs = domestic.reduce((s, d) => s + (d.crates * 30 + d.pieces), 0)
  const creditSalesCount = sales.filter(s => s.payment_status === 'credit' && s.credit_status !== 'paid').length

  const debtors = customers.filter(c => c.outstanding > 0)
  const totalOutstanding = debtors.reduce((sum, c) => sum + c.outstanding, 0)
  const [debtExpanded, setDebtExpanded] = useState(false)

  // ── Sales filters ──────────────────────────────────────────
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo]     = useState('')
  const [filterPayment, setFilterPayment]   = useState('')
  const [filterSize, setFilterSize]         = useState('')
  const [filterFlock, setFilterFlock]       = useState('')

  const hasFilters = filterDateFrom || filterDateTo || filterPayment || filterSize || filterFlock

  const filteredSales = sales.filter(s => {
    if (filterDateFrom && s.date < filterDateFrom) return false
    if (filterDateTo   && s.date > filterDateTo)   return false
    if (filterSize     && s.egg_size !== filterSize) return false
    if (filterFlock    && String(s.flock_id) !== filterFlock) return false
    if (filterPayment) {
      if (filterPayment === 'cash'    && (s.payment_status && s.payment_status !== 'cash')) return false
      if (filterPayment === 'credit'  && !(s.payment_status === 'credit' && s.credit_status === 'unpaid')) return false
      if (filterPayment === 'partial' && s.credit_status !== 'partial') return false
      if (filterPayment === 'paid'    && !(s.payment_status === 'cash' || s.credit_status === 'paid')) return false
    }
    return true
  })

  function clearFilters() {
    setFilterDateFrom(''); setFilterDateTo('')
    setFilterPayment(''); setFilterSize(''); setFilterFlock('')
  }

  const eggSizes = [...new Set(sales.map(s => s.egg_size).filter(Boolean))]

  const salesColumns = [
    { key: 'date', label: 'Date', width: 130, render: v => formatDate(v) },
    {
      key: 'egg_size', label: 'Size', width: 100,
      render: v => <span className={styles.sizeBadge}>{v}</span>
    },
    { key: 'price_per_crate', label: 'Price/Crate', align: 'right', width: 130, render: v => formatCurrency(v) },
    {
      key: 'flock_name', label: 'Flock', width: 160,
      render: (v, row) => (
        <span className={styles.flockBadge}
          style={{ background: (row.flock_color || '#2563eb') + '22', color: row.flock_color || '#2563eb', borderColor: (row.flock_color || '#2563eb') + '55' }}>
          {v || '—'}
        </span>
      )
    },
    { key: 'crates', label: 'Crates', align: 'right', width: 90 },
    { key: 'pieces', label: 'Pieces', align: 'right', width: 90 },
    {
      key: 'total_revenue', label: 'Revenue', align: 'right', width: 140,
      render: v => <span className={styles.revenueCell}>{formatCurrency(v)}</span>
    },
    {
      key: 'payment_status', label: 'Payment', width: 180,
      render: (v, row) => {
        if (!v || v === 'cash') return <span className={styles.payBadgeCash}>Cash</span>
        const customer = row.credit_customer_name ? ` · ${row.credit_customer_name}` : ''
        if (row.credit_status === 'paid') {
          return <span className={styles.payBadgeCash} title={row.credit_customer_name || ''}>Paid{customer}</span>
        }
        if (row.credit_status === 'partial') {
          return <span className={styles.payBadgePartial} title={row.credit_customer_name || ''}>Part Paid{customer}</span>
        }
        return (
          <span className={styles.payBadgeCredit} title={row.credit_customer_name || ''}>
            Credit{customer}
          </span>
        )
      }
    },
    {
      key: 'actions', label: '', align: 'right', width: 110,
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <Button size="sm" variant="secondary" onClick={() => openEditSales(row)}>Edit</Button>
          <Button size="sm" variant="danger" onClick={() => handleDeleteSales(row.id)}>Del</Button>
        </div>
      )
    },
  ]

  const domColumns = [
    { key: 'date', label: 'Date', render: v => formatDate(v) },
    { key: 'location', label: 'Location / Purpose', render: v => v || <span style={{ color: '#9ca3af' }}>—</span> },
    {
      key: 'flock_name', label: 'Flock',
      render: (v, row) => (
        <span className={styles.flockBadge}
          style={{ background: (row.flock_color || '#2563eb') + '22', color: row.flock_color || '#2563eb', borderColor: (row.flock_color || '#2563eb') + '55' }}>
          {v || '—'}
        </span>
      )
    },
    { key: 'crates', label: 'Crates', align: 'right' },
    { key: 'pieces', label: 'Pieces', align: 'right' },
    {
      key: '_total', label: 'Total Eggs', align: 'right',
      render: (_, row) => <span className={styles.eggCount}>{row.crates * 30 + row.pieces} eggs</span>
    },
    {
      key: 'actions', label: '', align: 'right', width: 110,
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <Button size="sm" variant="secondary" onClick={() => openEditDom(row)}>Edit</Button>
          <Button size="sm" variant="danger" onClick={() => handleDeleteDom(row.id)}>Del</Button>
        </div>
      )
    },
  ]

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
        {(summary?.bySize || []).map(s => (
          <div key={s.egg_size} className={styles.kpiItem}>
            <div className={styles.kpiItemValue}>{formatCurrency(s.total_revenue)}</div>
            <div className={styles.kpiItemLabel}>{s.egg_size} Eggs</div>
          </div>
        ))}
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
                    <div className={styles.debtSub}>{c.total_sales} sale{c.total_sales !== 1 ? 's' : ''} · {formatCurrency(c.total_owed)} total</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab Bar */}
      <div className={styles.tabBar}>
        <button
          className={`${styles.tab} ${activeTab === 'sales' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('sales')}
        >
          <span className={styles.tabIcon}>🧾</span>
          Sales Records
          {sales.length > 0 && <span className={styles.tabCount}>{sales.length}</span>}
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'domestic' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('domestic')}
        >
          <span className={styles.tabIcon}>🏠</span>
          Domestic Usage & Gifting
          {domestic.length > 0 && <span className={styles.tabCount}>{domestic.length}</span>}
        </button>
      </div>

      {/* Tab Content */}
      <div className={styles.tabContent}>
        {activeTab === 'sales' && (
          <>
            <div className={styles.toolbar}>
              <Button onClick={openAddSales}>+ Add Sale</Button>
              <span className={styles.recordCount}>
                {hasFilters
                  ? `${filteredSales.length} of ${sales.length} records`
                  : `${sales.length} record${sales.length !== 1 ? 's' : ''} this month`}
              </span>
            </div>

            {/* Filter Bar */}
            <div className={styles.filterBar}>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>From</label>
                <input type="date" className={styles.filterInput}
                  value={filterDateFrom}
                  onChange={e => setFilterDateFrom(e.target.value)} />
              </div>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>To</label>
                <input type="date" className={styles.filterInput}
                  value={filterDateTo}
                  onChange={e => setFilterDateTo(e.target.value)} />
              </div>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Payment</label>
                <select className={styles.filterInput}
                  value={filterPayment}
                  onChange={e => setFilterPayment(e.target.value)}>
                  <option value="">All</option>
                  <option value="cash">Cash</option>
                  <option value="credit">Credit (unpaid)</option>
                  <option value="partial">Part Paid</option>
                  <option value="paid">Fully Paid</option>
                </select>
              </div>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Egg Size</label>
                <select className={styles.filterInput}
                  value={filterSize}
                  onChange={e => setFilterSize(e.target.value)}>
                  <option value="">All Sizes</option>
                  {eggSizes.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Flock</label>
                <select className={styles.filterInput}
                  value={filterFlock}
                  onChange={e => setFilterFlock(e.target.value)}>
                  <option value="">All Flocks</option>
                  {flocks.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              {hasFilters && (
                <button className={styles.filterClear} onClick={clearFilters}>✕ Clear</button>
              )}
            </div>

            <Table columns={salesColumns} data={filteredSales} emptyMessage="No sales match the selected filters." />
          </>
        )}

        {activeTab === 'domestic' && (
          <>
            <div className={styles.toolbar}>
              <Button onClick={openAddDom}>+ Add Usage</Button>
              <span className={styles.recordCount}>{domestic.length} record{domestic.length !== 1 ? 's' : ''} this month</span>
            </div>
            <Table columns={domColumns} data={domestic} emptyMessage="No domestic usage recorded." />
          </>
        )}
      </div>

      {/* Sales Modal */}
      {showSalesModal && (
        <Modal
          title={editSales ? 'Edit Sale' : 'Add Sale'}
          onClose={() => setShowSalesModal(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowSalesModal(false)}>Cancel</Button>
              <Button onClick={handleSalesSubmit}>Save</Button>
            </>
          }
        >
          <form onSubmit={handleSalesSubmit} className={styles.form}>
            {/* Payment Type Toggle */}
            <div className={styles.payToggleRow}>
              <span className={styles.payToggleLabel}>Payment Type</span>
              <div className={styles.payToggle}>
                <button
                  type="button"
                  className={`${styles.payToggleBtn} ${salesForm.payment_status === 'cash' ? styles.payToggleBtnActive : ''}`}
                  onClick={() => setSalesForm(f => ({ ...f, payment_status: 'cash', credit_customer_id: '' }))}
                >
                  💵 Cash
                </button>
                <button
                  type="button"
                  className={`${styles.payToggleBtn} ${salesForm.payment_status === 'credit' ? styles.payToggleBtnCredit : ''}`}
                  onClick={() => setSalesForm(f => ({ ...f, payment_status: 'credit' }))}
                >
                  📋 Credit
                </button>
              </div>
            </div>

            {/* Customer picker — shown only for credit */}
            {salesForm.payment_status === 'credit' && (
              <div className={styles.customerRow}>
                <FormField label="Customer (Debtor)" style={{ flex: 1 }}>
                  <Select value={salesForm.credit_customer_id}
                    onChange={e => setSalesForm(f => ({ ...f, credit_customer_id: e.target.value }))}
                    required>
                    <option value="">— Select customer —</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.outstanding > 0 ? ` (owes ${formatCurrency(c.outstanding)})` : ''}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <button
                  type="button"
                  className={styles.newCustomerBtn}
                  onClick={() => setShowNewCustomerModal(true)}
                  title="Add new customer"
                >
                  + New
                </button>
              </div>
            )}

            <div className={styles.formGrid}>
              <FormField label="Date">
                <Input type="date" value={salesForm.date}
                  onChange={e => setSalesForm(f => ({ ...f, date: e.target.value }))} required />
              </FormField>
              <FormField label="Flock">
                <Select value={salesForm.flock_id}
                  onChange={e => setSalesForm(f => ({ ...f, flock_id: e.target.value }))}>
                  {flocks.map(fk => <option key={fk.id} value={fk.id}>{fk.name}</option>)}
                </Select>
              </FormField>
              <FormField label="Egg Size">
                <Select value={salesForm.egg_size}
                  onChange={e => {
                    const size = e.target.value
                    const matched = prices.find(p => p.size === size)
                    setSalesForm(f => ({
                      ...f, egg_size: size,
                      price_per_crate: matched ? matched.price_per_crate : f.price_per_crate
                    }))
                  }}>
                  <option value="">— Select size —</option>
                  {prices.map(p => <option key={p.id} value={p.size}>{p.size}</option>)}
                </Select>
              </FormField>
              <FormField label="Price per Crate (₦)">
                <Input type="number" min="0" value={salesForm.price_per_crate}
                  onChange={e => setSalesForm(f => ({ ...f, price_per_crate: e.target.value }))} required />
              </FormField>
              <FormField label="Crates">
                <Input type="number" min="0" value={salesForm.crates}
                  onChange={e => setSalesForm(f => ({ ...f, crates: e.target.value }))} required />
              </FormField>
              <FormField label="Pieces (loose, 0–29)">
                <Input type="number" min="0" max="29" value={salesForm.pieces}
                  onChange={e => setSalesForm(f => ({ ...f, pieces: e.target.value }))} required />
              </FormField>
            </div>

            {/* Deposit — shown after sale details so total is known first */}
            {salesForm.payment_status === 'credit' && (
              <FormField
                label="Deposit / Amount Paid Now (₦)"
                hint="Leave as 0 if nothing was paid upfront. Enter partial amount if a deposit was made."
              >
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={salesForm.amount_paid_now}
                  onChange={e => setSalesForm(f => ({ ...f, amount_paid_now: e.target.value }))}
                />
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

      {/* New Customer Quick-Add Modal */}
      {showNewCustomerModal && (
        <Modal
          title="New Customer"
          onClose={() => setShowNewCustomerModal(false)}
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
                <Input type="text" placeholder="Full name" value={newCustomerName}
                  onChange={e => setNewCustomerName(e.target.value)} required />
              </FormField>
              <FormField label="Phone (optional)">
                <Input type="text" placeholder="Phone number" value={newCustomerPhone}
                  onChange={e => setNewCustomerPhone(e.target.value)} />
              </FormField>
            </div>
          </form>
        </Modal>
      )}

      {/* Domestic Modal */}
      {showDomModal && (
        <Modal
          title={editDom ? 'Edit Domestic Usage' : 'Add Domestic Usage'}
          onClose={() => setShowDomModal(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowDomModal(false)}>Cancel</Button>
              <Button onClick={handleDomSubmit}>Save</Button>
            </>
          }
        >
          <form onSubmit={handleDomSubmit} className={styles.form}>
            <div className={styles.formGrid}>
              <FormField label="Date">
                <Input type="date" value={domForm.date}
                  onChange={e => setDomForm(f => ({ ...f, date: e.target.value }))} required />
              </FormField>
              <FormField label="Flock">
                <Select value={domForm.flock_id}
                  onChange={e => setDomForm(f => ({ ...f, flock_id: e.target.value }))}>
                  {flocks.map(fk => <option key={fk.id} value={fk.id}>{fk.name}</option>)}
                </Select>
              </FormField>
              <FormField label="Location / Purpose">
                <Input type="text" placeholder="e.g. Kitchen, Gift to John"
                  value={domForm.location}
                  onChange={e => setDomForm(f => ({ ...f, location: e.target.value }))} />
              </FormField>
              <FormField label="Crates">
                <Input type="number" min="0" value={domForm.crates}
                  onChange={e => setDomForm(f => ({ ...f, crates: e.target.value }))} required />
              </FormField>
              <FormField label="Pieces (loose)">
                <Input type="number" min="0" max="29" value={domForm.pieces}
                  onChange={e => setDomForm(f => ({ ...f, pieces: e.target.value }))} required />
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
    </div>
  )
}
