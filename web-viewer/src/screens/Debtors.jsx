import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { formatDate, formatCurrency, toMonthYear } from '../utils/format'
import { useAuth } from '../utils/AuthContext'
import Modal from '../components/common/Modal'
import Button from '../components/common/Button'
import FormField from '../components/common/FormField'
import styles from './Debtors.module.css'
import dayjs from 'dayjs'

const TODAY = dayjs().format('YYYY-MM-DD')
const PAYMENT_METHODS = ['Cash', 'Transfer', 'POS', 'Cheque']

const EMPTY_CUSTOMER = { name: '', phone: '', notes: '' }
const EMPTY_SALE = { date: TODAY, egg_size: '', price_per_crate: '', crates: '', pieces: '', amount_paid: '0', notes: '' }
const EMPTY_PAYMENT = { date: TODAY, payment_method: 'Cash', amount: '', notes: '' }

function computeSaleAmounts(form) {
  const crates = parseFloat(form.crates) || 0
  const pieces = parseFloat(form.pieces) || 0
  const ppc = parseFloat(form.price_per_crate) || 0
  const paid = parseFloat(form.amount_paid) || 0
  const owed = (crates + pieces / 30) * ppc
  let status = 'unpaid'
  if (paid >= owed && owed > 0) status = 'paid'
  else if (paid > 0) status = 'partial'
  return { owed, status }
}

function StatusBadge({ status }) {
  const map = {
    paid:    { bg: '#dcfce7', color: '#166534', label: '✓ Paid' },
    partial: { bg: '#fef3c7', color: '#92400e', label: 'Partial' },
    unpaid:  { bg: '#fee2e2', color: '#991b1b', label: 'Unpaid' },
  }
  const s = map[status] || map.unpaid
  return <span style={{ background: s.bg, color: s.color, padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>{s.label}</span>
}

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

export default function Debtors() {
  const { can } = useAuth()
  const [customers, setCustomers] = useState([])
  const [selected, setSelected] = useState(null)
  const [sales, setSales] = useState([])
  const [prices, setPrices] = useState([])
  const [loading, setLoading] = useState(true)
  const [salesLoading, setSalesLoading] = useState(false)
  const [customerTab, setCustomerTab] = useState('owing')
  const [deactivateError, setDeactivateError] = useState(null)
  const [saving, setSaving] = useState(false)

  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [editCustomer, setEditCustomer] = useState(null)
  const [customerForm, setCustomerForm] = useState(EMPTY_CUSTOMER)

  const [showSaleModal, setShowSaleModal] = useState(false)
  const [editSale, setEditSale] = useState(null)
  const [saleForm, setSaleForm] = useState(EMPTY_SALE)

  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentTargetSale, setPaymentTargetSale] = useState(null)
  const [paymentForm, setPaymentForm] = useState(EMPTY_PAYMENT)

  const [showPaymentsModal, setShowPaymentsModal] = useState(false)
  const [viewPaymentsSale, setViewPaymentsSale] = useState(null)
  const [payments, setPayments] = useState([])

  const loadCustomers = useCallback(async () => {
    setLoading(true)
    const [{ data: csData }, { data: custData }] = await Promise.all([
      supabase.from('credit_sales').select('customer_id, amount_owed, amount_paid, status'),
      supabase.from('credit_customers').select('*').order('name'),
    ])
    const enriched = (custData || []).map(c => {
      const cs = (csData || []).filter(s => s.customer_id === c.id)
      const total_owed = cs.reduce((sum, s) => sum + (s.amount_owed || 0), 0)
      const total_paid = cs.reduce((sum, s) => sum + (s.amount_paid || 0), 0)
      const outstanding = Math.max(0, total_owed - total_paid)
      return { ...c, total_owed, total_paid, outstanding, total_sales: cs.length }
    })
    setCustomers(enriched)
    if (selected) {
      const updated = enriched.find(c => c.id === selected.id)
      setSelected(updated || null)
    }
    setLoading(false)
  }, [selected])

  const loadSales = useCallback(async (customerId) => {
    if (!customerId) { setSales([]); return }
    setSalesLoading(true)
    const { data } = await supabase.from('credit_sales').select('*').eq('customer_id', customerId).order('date', { ascending: false })
    setSales(data || [])
    setSalesLoading(false)
  }, [])

  useEffect(() => {
    loadCustomers()
    supabase.from('egg_prices').select('*').order('id').then(({ data }) => setPrices(data || []))
  }, [])

  useEffect(() => { loadSales(selected?.id) }, [selected?.id])

  const activeCustomers = customers.filter(c => c.is_active !== 0)
  const totalOutstanding = activeCustomers.reduce((s, c) => s + (c.outstanding || 0), 0)
  const customersWithDebt = activeCustomers.filter(c => (c.outstanding || 0) > 0).length

  const tabCustomers = {
    owing:    customers.filter(c => c.is_active !== 0 && (c.outstanding || 0) > 0),
    cleared:  customers.filter(c => c.is_active !== 0 && (c.outstanding || 0) <= 0 && c.total_sales > 0),
    inactive: customers.filter(c => c.is_active === 0),
  }
  const visible = tabCustomers[customerTab] || []

  // ── Customer CRUD ────────────────────────────────────────────
  function openAddCustomer() { setEditCustomer(null); setCustomerForm(EMPTY_CUSTOMER); setShowCustomerModal(true) }
  function openEditCustomer(c) { setEditCustomer(c); setCustomerForm({ name: c.name || '', phone: c.phone || '', notes: c.notes || '' }); setShowCustomerModal(true) }

  async function handleCustomerSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      if (editCustomer) {
        await supabase.from('credit_customers').update({ name: customerForm.name, phone: customerForm.phone || null, notes: customerForm.notes || null }).eq('id', editCustomer.id)
      } else {
        await supabase.from('credit_customers').insert({ name: customerForm.name, phone: customerForm.phone || null, notes: customerForm.notes || null, is_active: true })
      }
      setShowCustomerModal(false)
      loadCustomers()
    } finally { setSaving(false) }
  }

  async function handleDeactivateCustomer(c) {
    if ((c.outstanding || 0) > 0) {
      setDeactivateError({ customerId: c.id, message: `${c.name} still has an outstanding balance of ${formatCurrency(c.outstanding)}. Clear all debts before deactivating.` })
      return
    }
    setDeactivateError(null)
    await supabase.from('credit_customers').update({ is_active: false }).eq('id', c.id)
    if (selected?.id === c.id) setSelected(null)
    loadCustomers()
  }

  async function handleReactivateCustomer(c) {
    await supabase.from('credit_customers').update({ is_active: true }).eq('id', c.id)
    loadCustomers()
  }

  async function handleDeleteCustomer(c) {
    if (!confirm(`Delete "${c.name}"? This cannot be undone.`)) return
    await supabase.from('credit_customers').delete().eq('id', c.id)
    if (selected?.id === c.id) setSelected(null)
    loadCustomers()
  }

  // ── Credit Sale CRUD ─────────────────────────────────────────
  function openAddSale() {
    setEditSale(null)
    const fp = prices[0]
    setSaleForm({ ...EMPTY_SALE, date: TODAY, egg_size: fp?.size || '', price_per_crate: fp?.price_per_crate ? String(fp.price_per_crate) : '' })
    setShowSaleModal(true)
  }

  function openEditSale(row) {
    setEditSale(row)
    setSaleForm({ date: row.date, egg_size: row.egg_size || '', price_per_crate: String(row.price_per_crate || ''), crates: String(row.crates || ''), pieces: String(row.pieces || ''), amount_paid: String(row.amount_paid || '0'), notes: row.notes || '' })
    setShowSaleModal(true)
  }

  async function handleSaleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const { owed, status } = computeSaleAmounts(saleForm)
      const data = {
        date: saleForm.date, month_year: toMonthYear(saleForm.date),
        customer_id: selected.id, egg_size: saleForm.egg_size,
        price_per_crate: parseFloat(saleForm.price_per_crate) || 0,
        crates: parseFloat(saleForm.crates) || 0, pieces: parseFloat(saleForm.pieces) || 0,
        amount_owed: owed, amount_paid: parseFloat(saleForm.amount_paid) || 0,
        status, notes: saleForm.notes || null,
      }
      if (editSale) await supabase.from('credit_sales').update(data).eq('id', editSale.id)
      else await supabase.from('credit_sales').insert(data)
      setShowSaleModal(false)
      loadSales(selected.id)
      loadCustomers()
    } finally { setSaving(false) }
  }

  async function handleDeleteSale(row) {
    const hasPayments = (row.amount_paid || 0) > 0
    const msg = hasPayments
      ? `Delete this credit sale and all its payments?\n\nThis will remove the revenue from ${row.month_year} and all recorded payments.`
      : 'Delete this credit sale?'
    if (!confirm(msg)) return
    await supabase.from('debt_payments').delete().eq('credit_sale_id', row.id)
    await supabase.from('credit_sales').delete().eq('id', row.id)
    loadSales(selected.id)
    loadCustomers()
  }

  // ── Payments ─────────────────────────────────────────────────
  function openRecordPayment(sale) {
    setPaymentTargetSale(sale)
    const outstanding = (sale.amount_owed || 0) - (sale.amount_paid || 0)
    setPaymentForm({ ...EMPTY_PAYMENT, date: TODAY, amount: String(Math.max(0, outstanding)) })
    setShowPaymentModal(true)
  }

  async function handlePaymentSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const amount = parseFloat(paymentForm.amount) || 0
      await supabase.from('debt_payments').insert({
        credit_sale_id: paymentTargetSale.id,
        customer_id: selected.id,
        date: paymentForm.date,
        month_year: toMonthYear(paymentForm.date),
        amount,
        payment_method: paymentForm.payment_method,
        notes: paymentForm.notes || null,
      })
      const newPaid = (paymentTargetSale.amount_paid || 0) + amount
      const newOwed = paymentTargetSale.amount_owed || 0
      const newStatus = newPaid >= newOwed ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid'
      await supabase.from('credit_sales').update({ amount_paid: newPaid, status: newStatus }).eq('id', paymentTargetSale.id)
      setShowPaymentModal(false)
      loadSales(selected.id)
      loadCustomers()
    } finally { setSaving(false) }
  }

  async function openViewPayments(sale) {
    setViewPaymentsSale(sale)
    const { data } = await supabase.from('debt_payments').select('*').eq('credit_sale_id', sale.id).order('date', { ascending: false })
    setPayments(data || [])
    setShowPaymentsModal(true)
  }

  const saleAmounts = computeSaleAmounts(saleForm)
  const paymentOutstanding = paymentTargetSale ? (paymentTargetSale.amount_owed || 0) - (paymentTargetSale.amount_paid || 0) : 0
  const paymentNewOutstanding = paymentOutstanding - (parseFloat(paymentForm.amount) || 0)

  return (
    <div className={styles.page}>
      {/* Summary bar */}
      <div className={styles.summaryBar}>
        <div className={styles.summaryItem}>
          <div className={styles.summaryValue} style={{ color: '#dc2626' }}>{formatCurrency(totalOutstanding)}</div>
          <div className={styles.summaryLabel}>Total Outstanding</div>
        </div>
        <div className={styles.summaryDivider} />
        <div className={styles.summaryItem}>
          <div className={styles.summaryValue}>{customersWithDebt}</div>
          <div className={styles.summaryLabel}>Customers with Debt</div>
        </div>
        <div className={styles.summaryDivider} />
        <div className={styles.summaryItem}>
          <div className={styles.summaryValue}>{customers.length}</div>
          <div className={styles.summaryLabel}>Total Customers</div>
        </div>
        <div className={styles.summaryDivider} />
        <div className={styles.summaryItem}>
          <div className={styles.summaryValue}>{customers.reduce((s, c) => s + (c.total_sales || 0), 0)}</div>
          <div className={styles.summaryLabel}>All-time Credit Sales</div>
        </div>
      </div>

      {/* Layout */}
      <div className={styles.layout}>
        {/* Left panel */}
        <div className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Credit Customers</span>
            {can('write') && <Button size="sm" onClick={openAddCustomer}>+ Add</Button>}
          </div>

          <div className={styles.customerTabs}>
            {[
              { key: 'owing',    label: 'Owing',    count: tabCustomers.owing.length },
              { key: 'cleared',  label: 'Cleared',  count: tabCustomers.cleared.length },
              { key: 'inactive', label: 'Inactive', count: tabCustomers.inactive.length },
            ].map(t => (
              <button key={t.key}
                className={`${styles.customerTab} ${customerTab === t.key ? styles.customerTabActive : ''}`}
                onClick={() => { setCustomerTab(t.key); setDeactivateError(null); setSelected(null) }}
              >
                {t.label}
                {t.count > 0 && <span className={styles.customerTabBadge}>{t.count}</span>}
              </button>
            ))}
          </div>

          {deactivateError && (
            <div className={styles.deactivateError}>
              <span>⚠</span>
              <span style={{ flex: 1 }}>{deactivateError.message}</span>
              <button className={styles.deactivateErrorClose} onClick={() => setDeactivateError(null)}>✕</button>
            </div>
          )}

          <div className={styles.customerList}>
            {loading
              ? <div className={styles.listLoading}><div className={styles.spinner} /></div>
              : visible.length === 0
                ? <div className={styles.emptyList}>
                    {customerTab === 'owing'    && 'No customers with outstanding debt.'}
                    {customerTab === 'cleared'  && 'No customers with fully cleared debt.'}
                    {customerTab === 'inactive' && 'No inactive customers.'}
                  </div>
                : visible.map(c => (
                  <div key={c.id}
                    className={`${styles.customerRow} ${selected?.id === c.id ? styles.customerRowSelected : ''} ${deactivateError?.customerId === c.id ? styles.customerRowError : ''}`}
                    onClick={() => { setSelected(c); setDeactivateError(null) }}
                  >
                    <div className={styles.customerInfo}>
                      <div className={styles.custName}>{c.name}</div>
                      {c.phone && <div className={styles.custPhone}>{c.phone}</div>}
                      <div style={{ marginTop: 4 }}>
                        {customerTab !== 'inactive' && (
                          (c.outstanding || 0) > 0
                            ? <span style={{ fontSize: 12, fontWeight: 600, color: '#dc2626' }}>Owes {formatCurrency(c.outstanding)}</span>
                            : c.total_sales > 0 ? <span style={{ fontSize: 12, fontWeight: 600, color: '#16a34a' }}>✓ Paid up</span> : null
                        )}
                      </div>
                    </div>
                    {can('write') && (
                      <div className={styles.rowActions} onClick={e => e.stopPropagation()}>
                        {customerTab !== 'inactive' && (
                          <button className={styles.iconBtn} title="Edit" onClick={() => openEditCustomer(c)}>✎</button>
                        )}
                        {customerTab === 'inactive'
                          ? <button className={`${styles.iconBtn} ${styles.iconBtnGreen}`} title="Reactivate" onClick={() => handleReactivateCustomer(c)}>↺</button>
                          : c.total_sales === 0
                            ? <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} title="Delete" onClick={() => handleDeleteCustomer(c)}>🗑</button>
                            : <button className={styles.iconBtn} title="Deactivate" onClick={() => handleDeactivateCustomer(c)}>⊘</button>
                        }
                      </div>
                    )}
                  </div>
                ))
            }
          </div>
        </div>

        {/* Right panel */}
        <div className={styles.rightPanel}>
          {!selected ? (
            <div className={styles.emptyState}>Select a customer to view their credit sales</div>
          ) : (
            <>
              <div className={styles.panelHeader}>
                <div>
                  <div className={styles.customerHeading}>
                    {selected.name}
                    {selected.is_active === 0 && (
                      <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: '#6b7280', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4, padding: '1px 6px', verticalAlign: 'middle' }}>Inactive</span>
                    )}
                  </div>
                  {selected.phone && <div className={styles.customerSubHeading}>{selected.phone}</div>}
                </div>
                {can('write') && selected.is_active !== 0 && (
                  <Button size="sm" onClick={openAddSale}>+ New Credit Sale</Button>
                )}
              </div>

              <div className={styles.customerStats}>
                <div className={styles.statItem}>
                  <div className={styles.statValue}>{formatCurrency(selected.total_owed || 0)}</div>
                  <div className={styles.statLabel}>Total Owed ({selected.total_sales || 0} sales)</div>
                </div>
                <div className={styles.statDivider} />
                <div className={styles.statItem}>
                  <div className={styles.statValue}>{formatCurrency(selected.total_paid || 0)}</div>
                  <div className={styles.statLabel}>Total Paid</div>
                </div>
                <div className={styles.statDivider} />
                <div className={styles.statItem}>
                  <div className={styles.statValue} style={{ color: (selected.outstanding || 0) > 0 ? '#dc2626' : '#16a34a' }}>
                    {formatCurrency(selected.outstanding || 0)}
                  </div>
                  <div className={styles.statLabel}>Outstanding</div>
                </div>
              </div>

              {salesLoading
                ? <div className={styles.listLoading}><div className={styles.spinner} /></div>
                : sales.length === 0
                  ? <div className={styles.emptyState} style={{ marginTop: 20 }}>No credit sales for this customer.</div>
                  : sales.map(row => (
                    <div key={row.id} className={styles.saleCard}>
                      <div className={styles.saleCardTop}>
                        <div className={styles.saleCardLeft}>
                          {row.egg_size && <span className={styles.sizeBadge}>{row.egg_size}</span>}
                          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{formatDate(row.date)}</span>
                          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{row.month_year}</span>
                        </div>
                        <div className={styles.saleCardRight}>
                          <StatusBadge status={row.status} />
                          {can('write') && (
                            <div style={{ display: 'flex', gap: 4 }}>
                              {row.status !== 'paid' && (
                                <Button size="sm" variant="primary" onClick={() => openRecordPayment(row)}>Pay</Button>
                              )}
                              <Button size="sm" variant="secondary" onClick={() => openViewPayments(row)}>History</Button>
                              <Button size="sm" variant="secondary" onClick={() => openEditSale(row)}>Edit</Button>
                              <Button size="sm" variant="danger" onClick={() => handleDeleteSale(row)}>Del</Button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className={styles.saleCardDetails}>
                        <span>{row.crates || 0} crates · {row.pieces || 0} pcs · {formatCurrency(row.price_per_crate)}/crate</span>
                        <span style={{ marginLeft: 12 }}>Owed: <strong>{formatCurrency(row.amount_owed)}</strong></span>
                        <span style={{ marginLeft: 8, color: '#16a34a' }}>Paid: <strong>{formatCurrency(row.amount_paid)}</strong></span>
                      </div>
                      {row.notes && <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>{row.notes}</div>}
                    </div>
                  ))
              }
            </>
          )}
        </div>
      </div>

      {/* Add/Edit Customer Modal */}
      {showCustomerModal && (
        <Modal title={editCustomer ? 'Edit Customer' : 'Add Customer'} onClose={() => setShowCustomerModal(false)} maxWidth={440}
          footer={<><Button variant="secondary" onClick={() => setShowCustomerModal(false)}>Cancel</Button><Button onClick={handleCustomerSubmit} disabled={saving}>{saving ? 'Saving…' : editCustomer ? 'Save' : 'Add'}</Button></>}
        >
          <form onSubmit={handleCustomerSubmit} className={styles.form}>
            <FormField label="Full Name">
              <Input value={customerForm.name} onChange={e => setCustomerForm(f => ({ ...f, name: e.target.value }))} placeholder="Customer name" required />
            </FormField>
            <FormField label="Phone (optional)">
              <Input value={customerForm.phone} onChange={e => setCustomerForm(f => ({ ...f, phone: e.target.value }))} placeholder="Phone number" />
            </FormField>
            <FormField label="Notes (optional)">
              <Input value={customerForm.notes} onChange={e => setCustomerForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any extra info" />
            </FormField>
          </form>
        </Modal>
      )}

      {/* Add/Edit Credit Sale Modal */}
      {showSaleModal && (
        <Modal title={editSale ? 'Edit Credit Sale' : 'New Credit Sale'} onClose={() => setShowSaleModal(false)}
          footer={<><Button variant="secondary" onClick={() => setShowSaleModal(false)}>Cancel</Button><Button onClick={handleSaleSubmit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button></>}
        >
          <form onSubmit={handleSaleSubmit} className={styles.form}>
            <div className={styles.formGrid}>
              <FormField label="Date">
                <Input type="date" value={saleForm.date} onChange={e => setSaleForm(f => ({ ...f, date: e.target.value }))} required />
              </FormField>
              <FormField label="Egg Size">
                <Sel value={saleForm.egg_size} onChange={e => { const p = prices.find(x => x.size === e.target.value); setSaleForm(f => ({ ...f, egg_size: e.target.value, price_per_crate: p ? String(p.price_per_crate) : f.price_per_crate })) }}>
                  <option value="">— Select size —</option>
                  {prices.map(p => <option key={p.id} value={p.size}>{p.size}</option>)}
                </Sel>
              </FormField>
              <FormField label="Price per Crate (₦)">
                <Input type="number" min="0" value={saleForm.price_per_crate} onChange={e => setSaleForm(f => ({ ...f, price_per_crate: e.target.value }))} required />
              </FormField>
              <FormField label="Crates">
                <Input type="number" min="0" value={saleForm.crates} onChange={e => setSaleForm(f => ({ ...f, crates: e.target.value }))} required />
              </FormField>
              <FormField label="Pieces (0–29)">
                <Input type="number" min="0" max="29" value={saleForm.pieces} onChange={e => setSaleForm(f => ({ ...f, pieces: e.target.value }))} required />
              </FormField>
              <FormField label="Deposit / Amount Paid Now (₦)" hint="0 if nothing was paid upfront">
                <Input type="number" min="0" step="0.01" value={saleForm.amount_paid} onChange={e => setSaleForm(f => ({ ...f, amount_paid: e.target.value }))} />
              </FormField>
            </div>
            <FormField label="Notes (optional)">
              <Input value={saleForm.notes} onChange={e => setSaleForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional note" />
            </FormField>
            {saleForm.crates !== '' && saleForm.price_per_crate !== '' && (
              <div className={styles.preview}>
                <div>Total owed: <strong>{formatCurrency(saleAmounts.owed)}</strong> · Status: <strong>{saleAmounts.status}</strong></div>
                {parseFloat(saleForm.amount_paid) > 0 && (
                  <div style={{ marginTop: 6, color: '#d97706' }}>Outstanding: <strong>{formatCurrency(Math.max(0, saleAmounts.owed - (parseFloat(saleForm.amount_paid) || 0)))}</strong></div>
                )}
              </div>
            )}
          </form>
        </Modal>
      )}

      {/* Record Payment Modal */}
      {showPaymentModal && paymentTargetSale && (
        <Modal title="Record Payment" onClose={() => setShowPaymentModal(false)} maxWidth={440}
          footer={<><Button variant="secondary" onClick={() => setShowPaymentModal(false)}>Cancel</Button><Button onClick={handlePaymentSubmit} disabled={saving}>{saving ? 'Saving…' : 'Record'}</Button></>}
        >
          <form onSubmit={handlePaymentSubmit} className={styles.form}>
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#92400e' }}>
              Outstanding balance: <strong>{formatCurrency(paymentOutstanding)}</strong>
            </div>
            <div className={styles.formGrid}>
              <FormField label="Date">
                <Input type="date" value={paymentForm.date} onChange={e => setPaymentForm(f => ({ ...f, date: e.target.value }))} required />
              </FormField>
              <FormField label="Payment Method">
                <Sel value={paymentForm.payment_method} onChange={e => setPaymentForm(f => ({ ...f, payment_method: e.target.value }))}>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </Sel>
              </FormField>
            </div>
            <FormField label="Amount (₦)">
              <Input type="number" min="0" step="0.01" value={paymentForm.amount} onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))} required />
            </FormField>
            <FormField label="Notes (optional)">
              <Input value={paymentForm.notes} onChange={e => setPaymentForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional note" />
            </FormField>
            {paymentForm.amount && (
              <div className={styles.preview}>
                After payment: <strong style={{ color: paymentNewOutstanding <= 0 ? '#16a34a' : '#d97706' }}>
                  {paymentNewOutstanding <= 0 ? '✓ Fully Paid' : `${formatCurrency(Math.max(0, paymentNewOutstanding))} remaining`}
                </strong>
              </div>
            )}
          </form>
        </Modal>
      )}

      {/* Payment History Modal */}
      {showPaymentsModal && viewPaymentsSale && (
        <Modal title="Payment History" onClose={() => setShowPaymentsModal(false)}
          footer={<Button onClick={() => setShowPaymentsModal(false)}>Close</Button>}
        >
          <div style={{ marginBottom: 12, fontSize: 13, color: '#64748b' }}>
            {viewPaymentsSale.egg_size} · {formatDate(viewPaymentsSale.date)} · Owed {formatCurrency(viewPaymentsSale.amount_owed)}
          </div>
          {payments.length === 0
            ? <div style={{ padding: '24px 0', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>No payments recorded.</div>
            : payments.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{formatCurrency(p.amount)}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{formatDate(p.date)} · {p.payment_method}</div>
                  {p.notes && <div style={{ fontSize: 12, color: '#94a3b8' }}>{p.notes}</div>}
                </div>
                <span style={{ color: '#16a34a', fontSize: 20 }}>✓</span>
              </div>
            ))
          }
        </Modal>
      )}
    </div>
  )
}
