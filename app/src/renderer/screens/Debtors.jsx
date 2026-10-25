import React, { useEffect, useState, useCallback } from 'react'
import PageLoader from '../components/common/PageLoader'
import { formatDate, formatCurrency, toMonthYear } from '../utils/format'
import Table from '../components/common/Table'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import FormField, { Input, Select } from '../components/common/FormField'
import styles from './Debtors.module.css'
import dayjs from 'dayjs'

const TODAY = dayjs().format('YYYY-MM-DD')

const EMPTY_CUSTOMER_FORM = { name: '', phone: '', notes: '' }

const EMPTY_SALE_FORM = {
  date: TODAY,
  egg_size: '',
  price_per_crate: '',
  crates: '',
  pieces: '',
  amount_paid: '0',
  notes: '',
}

const EMPTY_PAYMENT_FORM = {
  date: TODAY,
  payment_method: 'Cash',
  amount: '',
  notes: '',
}

function statusBadge(status) {
  const map = {
    paid: { bg: '#dcfce7', color: '#166534', label: '✓ Paid' },
    partial: { bg: '#fef3c7', color: '#92400e', label: 'Partial' },
    unpaid: { bg: '#fee2e2', color: '#991b1b', label: 'Unpaid' },
  }
  const s = map[status] || map.unpaid
  return (
    <span style={{ background: s.bg, color: s.color, padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
      {s.label}
    </span>
  )
}

function customerStatusPill(outstanding) {
  if (outstanding <= 0) {
    return <span className={`${styles.pill} ${styles.pillGreen}`}>Paid</span>
  }
  return <span className={`${styles.pill} ${styles.pillRed}`}>Owes {formatCurrency(outstanding)}</span>
}

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

export default function Debtors() {
  const [customers, setCustomers] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [sales, setSales] = useState([])
  const [prices, setPrices] = useState([])

  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [editCustomer, setEditCustomer] = useState(null)
  const [customerForm, setCustomerForm] = useState(EMPTY_CUSTOMER_FORM)

  const [showSaleModal, setShowSaleModal] = useState(false)
  const [editSale, setEditSale] = useState(null)
  const [saleForm, setSaleForm] = useState(EMPTY_SALE_FORM)

  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentTargetSale, setPaymentTargetSale] = useState(null)
  const [paymentForm, setPaymentForm] = useState(EMPTY_PAYMENT_FORM)

  const [showViewPaymentsModal, setShowViewPaymentsModal] = useState(false)
  const [viewPaymentsSale, setViewPaymentsSale] = useState(null)
  const [payments, setPayments] = useState([])

  const [loading, setLoading] = useState(true)

  const loadCustomers = useCallback(async () => {
    setLoading(true)
    const data = await window.api.debtors.getCustomers()
    setCustomers(data || [])
    if (selectedCustomer) {
      const updated = (data || []).find(c => c.id === selectedCustomer.id)
      if (updated) setSelectedCustomer(updated)
    }
    setLoading(false)
  }, [selectedCustomer])

  const loadSales = useCallback(async (customerId) => {
    if (!customerId) return
    const data = await window.api.debtors.getCreditSales({ customer_id: customerId })
    setSales(data || [])
  }, [])

  const loadPrices = useCallback(async () => {
    const data = await window.api.settings.getPrices()
    setPrices(data || [])
  }, [])

  useEffect(() => {
    loadCustomers()
    loadPrices()
  }, [])

  useEffect(() => {
    if (selectedCustomer) loadSales(selectedCustomer.id)
    else setSales([])
  }, [selectedCustomer])

  if (loading) return <PageLoader />

  const totalOutstanding = customers.reduce((s, c) => s + (c.outstanding || 0), 0)
  const customersWithDebt = customers.filter(c => (c.outstanding || 0) > 0).length
  const totalSalesCount = customers.reduce((s, c) => s + (c.total_sales || 0), 0)

  function openAddCustomer() {
    setEditCustomer(null)
    setCustomerForm(EMPTY_CUSTOMER_FORM)
    setShowCustomerModal(true)
  }

  function openEditCustomer(c) {
    setEditCustomer(c)
    setCustomerForm({ name: c.name || '', phone: c.phone || '', notes: c.notes || '' })
    setShowCustomerModal(true)
  }

  async function handleCustomerSubmit(e) {
    e.preventDefault()
    if (editCustomer) {
      await window.api.debtors.updateCustomer(editCustomer.id, customerForm)
    } else {
      await window.api.debtors.addCustomer(customerForm)
    }
    setShowCustomerModal(false)
    loadCustomers()
  }

  async function handleDeleteCustomer(c) {
    if (!confirm(`Delete customer "${c.name}"?`)) return
    const result = await window.api.debtors.deleteCustomer(c.id)
    if (result && result.error === 'has_unpaid') {
      alert('Cannot delete: this customer has unpaid credit sales.')
      return
    }
    if (selectedCustomer?.id === c.id) setSelectedCustomer(null)
    loadCustomers()
  }

  function openAddSale() {
    setEditSale(null)
    const firstPrice = prices[0]
    setSaleForm({
      ...EMPTY_SALE_FORM,
      egg_size: firstPrice?.size || '',
      price_per_crate: firstPrice?.price_per_crate || '',
    })
    setShowSaleModal(true)
  }

  function openEditSale(row) {
    setEditSale(row)
    setSaleForm({
      date: row.date,
      egg_size: row.egg_size,
      price_per_crate: String(row.price_per_crate),
      crates: String(row.crates || ''),
      pieces: String(row.pieces || ''),
      amount_paid: String(row.amount_paid || '0'),
      notes: row.notes || '',
    })
    setShowSaleModal(true)
  }

  async function handleSaleSubmit(e) {
    e.preventDefault()
    const { owed, status } = computeSaleAmounts(saleForm)
    const data = {
      date: saleForm.date,
      month_year: toMonthYear(saleForm.date),
      customer_id: selectedCustomer.id,
      egg_size: saleForm.egg_size,
      price_per_crate: parseFloat(saleForm.price_per_crate) || 0,
      crates: parseFloat(saleForm.crates) || 0,
      pieces: parseFloat(saleForm.pieces) || 0,
      amount_paid: parseFloat(saleForm.amount_paid) || 0,
      status,
      notes: saleForm.notes,
    }
    if (editSale) {
      await window.api.debtors.updateCreditSale(editSale.id, data)
    } else {
      await window.api.debtors.addCreditSale(data)
    }
    setShowSaleModal(false)
    loadSales(selectedCustomer.id)
    loadCustomers()
  }

  async function handleDeleteSale(row) {
    if (!confirm('Delete this credit sale?')) return
    await window.api.debtors.deleteCreditSale(row.id)
    loadSales(selectedCustomer.id)
    loadCustomers()
  }

  function openRecordPayment(sale) {
    setPaymentTargetSale(sale)
    setPaymentForm({ ...EMPTY_PAYMENT_FORM })
    setShowPaymentModal(true)
  }

  async function handlePaymentSubmit(e) {
    e.preventDefault()
    await window.api.debtors.addPayment({
      credit_sale_id: paymentTargetSale.id,
      date: paymentForm.date,
      month_year: toMonthYear(paymentForm.date),
      amount: parseFloat(paymentForm.amount) || 0,
      payment_method: paymentForm.payment_method,
      notes: paymentForm.notes,
    })
    setShowPaymentModal(false)
    loadSales(selectedCustomer.id)
    loadCustomers()
  }

  async function openViewPayments(sale) {
    setViewPaymentsSale(sale)
    const data = await window.api.debtors.getPayments(sale.id)
    setPayments(data || [])
    setShowViewPaymentsModal(true)
  }

  const saleComputedAmounts = computeSaleAmounts(saleForm)

  const paymentOutstanding = paymentTargetSale
    ? (paymentTargetSale.amount_owed || 0) - (paymentTargetSale.amount_paid || 0)
    : 0
  const paymentNewOutstanding = paymentOutstanding - (parseFloat(paymentForm.amount) || 0)

  const customerColumns = [
    {
      key: 'name', label: 'Customer',
      render: (v, row) => (
        <div>
          <div className={styles.custName}>{v}</div>
          {row.phone && <div className={styles.custPhone}>{row.phone}</div>}
        </div>
      )
    },
    {
      key: 'outstanding', label: 'Outstanding', align: 'right',
      render: (v) => customerStatusPill(v)
    },
    {
      key: 'actions', label: '', align: 'right', width: 72,
      render: (_, row) => (
        <div className={styles.rowActions} onClick={e => e.stopPropagation()}>
          <button className={styles.iconBtn} title="Edit" onClick={() => openEditCustomer(row)}>✎</button>
          <button className={styles.iconBtn} title="Delete" onClick={() => handleDeleteCustomer(row)}>✕</button>
        </div>
      )
    },
  ]

  const saleColumns = [
    { key: 'date', label: 'Date', render: v => formatDate(v) },
    { key: 'month_year', label: 'Month' },
    { key: 'egg_size', label: 'Size' },
    {
      key: 'crates', label: 'Eggs',
      render: (v, row) => `${v || 0} cr ${row.pieces || 0} pcs`
    },
    { key: 'amount_owed', label: 'Owed', align: 'right', render: v => formatCurrency(v) },
    { key: 'amount_paid', label: 'Paid', align: 'right', render: v => formatCurrency(v) },
    {
      key: 'status', label: 'Status', align: 'center',
      render: v => statusBadge(v)
    },
    {
      key: 'actions', label: '', align: 'right', width: 160,
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
          {row.status !== 'paid' && (
            <Button size="sm" variant="primary" onClick={() => openRecordPayment(row)}>Pay</Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => openViewPayments(row)}>History</Button>
          <Button size="sm" variant="secondary" onClick={() => openEditSale(row)}>Edit</Button>
          {(row.amount_paid === 0 || row.amount_paid === null) && (
            <Button size="sm" variant="danger" onClick={() => handleDeleteSale(row)}>Del</Button>
          )}
        </div>
      )
    },
  ]

  const paymentColumns = [
    { key: 'date', label: 'Date', render: v => formatDate(v) },
    { key: 'payment_method', label: 'Method' },
    { key: 'amount', label: 'Amount', align: 'right', render: v => formatCurrency(v) },
    { key: 'notes', label: 'Notes', render: v => v || <span style={{ color: '#9ca3af' }}>—</span> },
  ]

  return (
    <div className={styles.page}>
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
          <div className={styles.summaryValue}>{totalSalesCount}</div>
          <div className={styles.summaryLabel}>All-time Credit Sales</div>
        </div>
      </div>

      <div className={styles.layout}>
        <div className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Credit Customers</span>
            <Button size="sm" onClick={openAddCustomer}>+ Add Customer</Button>
          </div>
          <div className={styles.customerList}>
            {customers.length === 0 && (
              <div className={styles.emptyList}>No credit customers yet.</div>
            )}
            {customers.map(c => (
              <div
                key={c.id}
                className={`${styles.customerRow} ${selectedCustomer?.id === c.id ? styles.customerRowSelected : ''}`}
                onClick={() => setSelectedCustomer(c)}
              >
                <div className={styles.customerInfo}>
                  <div className={styles.custName}>{c.name}</div>
                  {c.phone && <div className={styles.custPhone}>{c.phone}</div>}
                  <div className={styles.custMeta}>
                    {customerStatusPill(c.outstanding || 0)}
                  </div>
                </div>
                <div className={styles.rowActions} onClick={e => e.stopPropagation()}>
                  <button className={styles.iconBtn} title="Edit" onClick={() => openEditCustomer(c)}>✎</button>
                  <button className={styles.iconBtn} title="Delete" onClick={() => handleDeleteCustomer(c)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.rightPanel}>
          {!selectedCustomer ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateText}>Select a customer to view their credit sales</div>
            </div>
          ) : (
            <>
              <div className={styles.panelHeader}>
                <div>
                  <div className={styles.customerHeading}>{selectedCustomer.name}</div>
                  {selectedCustomer.phone && (
                    <div className={styles.customerSubHeading}>{selectedCustomer.phone}</div>
                  )}
                </div>
                <Button size="sm" onClick={openAddSale}>+ New Credit Sale</Button>
              </div>

              <div className={styles.customerStats}>
                <div className={styles.statItem}>
                  <div className={styles.statValue}>{formatCurrency(selectedCustomer.total_owed || 0)}</div>
                  <div className={styles.statLabel}>Total Owed ({selectedCustomer.total_sales || 0} sales)</div>
                </div>
                <div className={styles.statDivider} />
                <div className={styles.statItem}>
                  <div className={styles.statValue}>{formatCurrency(selectedCustomer.total_paid || 0)}</div>
                  <div className={styles.statLabel}>Total Paid</div>
                </div>
                <div className={styles.statDivider} />
                <div className={styles.statItem}>
                  <div className={styles.statValue} style={{ color: (selectedCustomer.outstanding || 0) > 0 ? '#dc2626' : '#16a34a' }}>
                    {formatCurrency(selectedCustomer.outstanding || 0)}
                  </div>
                  <div className={styles.statLabel}>Outstanding</div>
                </div>
              </div>

              <Table
                columns={saleColumns}
                data={sales}
                emptyMessage="No credit sales for this customer."
                pageSize={10}
              />
            </>
          )}
        </div>
      </div>

      {showCustomerModal && (
        <Modal
          title={editCustomer ? 'Edit Customer' : 'Add Customer'}
          onClose={() => setShowCustomerModal(false)}
          maxWidth={440}
          footer={
            <>
              <Button variant="ghost" onClick={() => setShowCustomerModal(false)}>Cancel</Button>
              <Button type="submit" form="customer-form">{editCustomer ? 'Save' : 'Add'}</Button>
            </>
          }
        >
          <form id="customer-form" onSubmit={handleCustomerSubmit}>
            <FormField label="Name" error={!customerForm.name ? undefined : undefined}>
              <Input
                required
                value={customerForm.name}
                onChange={e => setCustomerForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Customer name"
              />
            </FormField>
            <FormField label="Phone">
              <Input
                value={customerForm.phone}
                onChange={e => setCustomerForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="Phone number"
              />
            </FormField>
            <FormField label="Notes">
              <Input
                value={customerForm.notes}
                onChange={e => setCustomerForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes"
              />
            </FormField>
          </form>
        </Modal>
      )}

      {showSaleModal && (
        <Modal
          title={editSale ? 'Edit Credit Sale' : 'New Credit Sale'}
          onClose={() => setShowSaleModal(false)}
          maxWidth={520}
          footer={
            <>
              <Button variant="ghost" onClick={() => setShowSaleModal(false)}>Cancel</Button>
              <Button type="submit" form="sale-form">{editSale ? 'Save' : 'Add'}</Button>
            </>
          }
        >
          <form id="sale-form" onSubmit={handleSaleSubmit}>
            <div className={styles.formRow}>
              <FormField label="Date">
                <Input
                  type="date"
                  value={saleForm.date}
                  onChange={e => setSaleForm(f => ({ ...f, date: e.target.value }))}
                  required
                />
              </FormField>
              <FormField label="Egg Size">
                <Select
                  value={saleForm.egg_size}
                  onChange={e => {
                    const size = e.target.value
                    const match = prices.find(p => p.size === size)
                    setSaleForm(f => ({
                      ...f,
                      egg_size: size,
                      price_per_crate: match ? String(match.price_per_crate) : f.price_per_crate,
                    }))
                  }}
                  required
                >
                  <option value="">Select size</option>
                  {prices.map(p => (
                    <option key={p.size} value={p.size}>{p.size}</option>
                  ))}
                </Select>
              </FormField>
            </div>
            <div className={styles.formRow}>
              <FormField label="Price per Crate (₦)">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={saleForm.price_per_crate}
                  onChange={e => setSaleForm(f => ({ ...f, price_per_crate: e.target.value }))}
                  required
                />
              </FormField>
              <FormField label="Crates">
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={saleForm.crates}
                  onChange={e => setSaleForm(f => ({ ...f, crates: e.target.value }))}
                  placeholder="0"
                />
              </FormField>
              <FormField label="Pieces">
                <Input
                  type="number"
                  min="0"
                  max="29"
                  value={saleForm.pieces}
                  onChange={e => setSaleForm(f => ({ ...f, pieces: e.target.value }))}
                  placeholder="0"
                />
              </FormField>
            </div>
            <div className={styles.formRow}>
              <FormField label="Amount Paid (₦)">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={saleForm.amount_paid}
                  onChange={e => setSaleForm(f => ({ ...f, amount_paid: e.target.value }))}
                />
              </FormField>
              <FormField label="Notes">
                <Input
                  value={saleForm.notes}
                  onChange={e => setSaleForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes"
                />
              </FormField>
            </div>
            <div className={styles.saleComputed}>
              <div className={styles.computedItem}>
                <span className={styles.computedLabel}>Amount Owed:</span>
                <span className={styles.computedValue}>{formatCurrency(saleComputedAmounts.owed)}</span>
              </div>
              <div className={styles.computedItem}>
                <span className={styles.computedLabel}>Status:</span>
                {statusBadge(saleComputedAmounts.status)}
              </div>
            </div>
          </form>
        </Modal>
      )}

      {showPaymentModal && paymentTargetSale && (
        <Modal
          title="Record Payment"
          onClose={() => setShowPaymentModal(false)}
          maxWidth={460}
          footer={
            <>
              <Button variant="ghost" onClick={() => setShowPaymentModal(false)}>Cancel</Button>
              <Button type="submit" form="payment-form">Record Payment</Button>
            </>
          }
        >
          <div className={styles.paymentSaleInfo}>
            <div className={styles.paymentInfoRow}>
              <span>Sale Date:</span>
              <strong>{formatDate(paymentTargetSale.date)}</strong>
            </div>
            <div className={styles.paymentInfoRow}>
              <span>Egg Size:</span>
              <strong>{paymentTargetSale.egg_size}</strong>
            </div>
            <div className={styles.paymentInfoRow}>
              <span>Amount Owed:</span>
              <strong>{formatCurrency(paymentTargetSale.amount_owed)}</strong>
            </div>
            <div className={styles.paymentInfoRow}>
              <span>Current Outstanding:</span>
              <strong style={{ color: '#dc2626' }}>{formatCurrency(paymentOutstanding)}</strong>
            </div>
          </div>
          <form id="payment-form" onSubmit={handlePaymentSubmit}>
            <div className={styles.formRow}>
              <FormField label="Payment Date">
                <Input
                  type="date"
                  value={paymentForm.date}
                  onChange={e => setPaymentForm(f => ({ ...f, date: e.target.value }))}
                  required
                />
              </FormField>
              <FormField label="Method">
                <Select
                  value={paymentForm.payment_method}
                  onChange={e => setPaymentForm(f => ({ ...f, payment_method: e.target.value }))}
                >
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Mobile Money">Mobile Money</option>
                </Select>
              </FormField>
            </div>
            <FormField label="Amount (₦)">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={paymentForm.amount}
                onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))}
                required
              />
            </FormField>
            <FormField label="Notes">
              <Input
                value={paymentForm.notes}
                onChange={e => setPaymentForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes"
              />
            </FormField>
            {paymentForm.amount && (
              <div className={styles.paymentPreview}>
                <span>New Outstanding after payment:</span>
                <strong style={{ color: paymentNewOutstanding <= 0 ? '#16a34a' : '#dc2626' }}>
                  {formatCurrency(Math.max(0, paymentNewOutstanding))}
                </strong>
              </div>
            )}
          </form>
        </Modal>
      )}

      {showViewPaymentsModal && viewPaymentsSale && (
        <Modal
          title={`Payment History — ${viewPaymentsSale.egg_size} (${formatDate(viewPaymentsSale.date)})`}
          onClose={() => setShowViewPaymentsModal(false)}
          maxWidth={580}
          footer={
            <Button variant="ghost" onClick={() => setShowViewPaymentsModal(false)}>Close</Button>
          }
        >
          <Table
            columns={paymentColumns}
            data={payments}
            emptyMessage="No payments recorded for this sale."
            pageSize={10}
          />
        </Modal>
      )}
    </div>
  )
}
