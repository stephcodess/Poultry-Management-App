import React, { useEffect, useState, useCallback } from 'react'
import { useMonth } from '../utils/MonthContext'
import { formatDate, formatCurrency, PAYMENT_METHODS, EXPENSE_CATEGORIES, toMonthYear } from '../utils/format'
import Table from '../components/common/Table'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import FormField, { Input, Select } from '../components/common/FormField'
import styles from './Expenses.module.css'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import dayjs from 'dayjs'

const FEED_TYPES = ['Layers Mash', 'Layers Pellet', 'Chick Mash', 'Grower Mash', 'Concentrate', 'Other']

const EMPTY_FORM = {
  date: dayjs().format('YYYY-MM-DD'),
  category: 'Feed',
  description: '',
  payment_method: 'Cash',
  amount: '',
  feed_type: 'Layers Mash',
  quantity_kg: '',
  bags: '',
  supplier: '',
}

const PIE_COLORS = [
  '#2563eb','#16a34a','#d97706','#dc2626','#7c3aed',
  '#0891b2','#be185d','#065f46','#92400e','#1e3a8a',
]

export default function Expenses() {
  const { monthYear } = useMonth()
  const [records, setRecords] = useState([])
  const [summary, setSummary] = useState(null)
  const [balance, setBalance] = useState(null)
  const [salesSummary, setSalesSummary] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editRecord, setEditRecord] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const load = useCallback(async () => {
    await window.api.balance.autoLoad(monthYear)
    const [r, s, b, ss] = await Promise.all([
      window.api.expenses.getAll(monthYear),
      window.api.expenses.getSummary(monthYear),
      window.api.balance.get(monthYear),
      window.api.sales.getSummary(monthYear),
    ])
    setRecords(r)
    setSummary(s)
    setBalance(b)
    setSalesSummary(ss)
  }, [monthYear])

  useEffect(() => { load() }, [load])

  function openAdd() {
    setEditRecord(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  function openEdit(row) {
    setEditRecord(row)
    setForm({
      date: row.date, category: row.category, description: row.description || '',
      payment_method: row.payment_method, amount: row.amount,
      feed_type: row.feed_type || 'Layers Mash',
      quantity_kg: row.quantity_kg || '',
      bags: row.bags || '',
      supplier: row.supplier || '',
    })
    setShowModal(true)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this expense?')) return
    await window.api.expenses.delete(id)
    load()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const isFeed = form.category === 'Feed'
    const data = {
      ...form,
      month_year: toMonthYear(form.date),
      amount: Number(form.amount),
      quantity_kg: isFeed && form.quantity_kg ? Number(form.quantity_kg) : null,
      bags: isFeed && form.bags ? Number(form.bags) : null,
      feed_type: isFeed ? form.feed_type : null,
      supplier: isFeed ? (form.supplier || null) : null,
    }
    if (editRecord) {
      await window.api.expenses.update(editRecord.id, data)
    } else {
      await window.api.expenses.add(data)
    }
    setShowModal(false)
    load()
  }

  const openingBalance = balance?.opening_balance || 0
  const grossRevenue = salesSummary?.totals?.gross_revenue || 0
  const cashReceived = salesSummary?.cashReceived ?? grossRevenue
  const totalExpenses = summary?.total?.total_expenses || 0
  const totalCashIn = openingBalance + cashReceived
  const walletBalance = totalCashIn - totalExpenses
  const spentPct = totalCashIn > 0 ? Math.min((totalExpenses / totalCashIn) * 100, 100) : 0
  const isLow = walletBalance < totalCashIn * 0.2 && totalCashIn > 0

  const pieData = (summary?.byCategory || []).map(c => ({ name: c.category, value: c.total }))

  const columns = [
    { key: 'date', label: 'Date', render: v => formatDate(v) },
    {
      key: 'category', label: 'Category',
      render: (v, _, i) => (
        <span className={styles.catBadge}
          style={{ background: PIE_COLORS[pieData.findIndex(p => p.name === v) % PIE_COLORS.length] + '1a',
                   color: PIE_COLORS[pieData.findIndex(p => p.name === v) % PIE_COLORS.length] }}>
          {v}
        </span>
      )
    },
    {
      key: 'description', label: 'Description',
      render: (v, row) => {
        if (row.category === 'Feed' && (row.feed_type || row.quantity_kg)) {
          const parts = []
          if (row.feed_type) parts.push(row.feed_type)
          if (row.bags) parts.push(`${row.bags} bags`)
          if (row.quantity_kg) parts.push(`${row.quantity_kg} kg`)
          if (row.supplier) parts.push(`from ${row.supplier}`)
          return <span>{parts.join(' · ') || v || <span style={{ color: '#9ca3af' }}>—</span>}</span>
        }
        return v || <span style={{ color: '#9ca3af' }}>—</span>
      }
    },
    {
      key: 'payment_method', label: 'Payment',
      render: v => <span className={styles.payBadge}>{v}</span>
    },
    {
      key: 'amount', label: 'Amount', align: 'right',
      render: v => <span className={styles.amountCell}>{formatCurrency(v)}</span>
    },
    {
      key: 'actions', label: '', align: 'right', width: 100,
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>Edit</Button>
          <Button size="sm" variant="danger" onClick={() => handleDelete(row.id)}>Del</Button>
        </div>
      )
    },
  ]

  return (
    <div className={styles.page}>

      {/* Wallet Banner */}
      <div className={`${styles.walletBanner} ${isLow ? styles.walletLow : walletBalance < 0 ? styles.walletNegative : styles.walletHealthy}`}>
        <div className={styles.walletLeft}>
          <div className={styles.walletIcon}>{walletBalance < 0 ? '🔴' : isLow ? '🟡' : '💵'}</div>
          <div>
            <div className={styles.walletLabel}>Wallet Balance</div>
            <div className={styles.walletAmount}>{formatCurrency(walletBalance)}</div>
            <div className={styles.walletSub}>
              {walletBalance < 0
                ? `Overspent by ${formatCurrency(Math.abs(walletBalance))}`
                : isLow
                ? 'Running low — less than 20% remaining'
                : 'Funds available this month'}
            </div>
          </div>
        </div>
        <div className={styles.walletRight}>
          <div className={styles.walletStat}>
            <span className={styles.walletStatLabel}>Opening Balance</span>
            <span className={styles.walletStatValue}>{formatCurrency(openingBalance)}</span>
          </div>
          <div className={styles.walletStatDivider} />
          <div className={styles.walletStat}>
            <span className={styles.walletStatLabel}>+ Cash Received</span>
            <span className={styles.walletStatValue} style={{ color: '#16a34a' }}>{formatCurrency(cashReceived)}</span>
          </div>
          <div className={styles.walletStatDivider} />
          <div className={styles.walletStat}>
            <span className={styles.walletStatLabel}>Total Cash In</span>
            <span className={styles.walletStatValue}>{formatCurrency(totalCashIn)}</span>
          </div>
          <div className={styles.walletStatDivider} />
          <div className={styles.walletStat}>
            <span className={styles.walletStatLabel}>− Expenses</span>
            <span className={styles.walletStatValue} style={{ color: '#dc2626' }}>{formatCurrency(totalExpenses)}</span>
          </div>
        </div>

        {/* Spend progress bar */}
        <div className={styles.walletProgress}>
          <div className={styles.walletProgressTrack}>
            <div
              className={styles.walletProgressFill}
              style={{
                width: `${spentPct}%`,
                background: walletBalance < 0 ? '#dc2626' : isLow ? '#d97706' : '#16a34a',
              }}
            />
          </div>
          <div className={styles.walletProgressLabel}>
            <span>{spentPct.toFixed(0)}% spent</span>
            <span>{(100 - spentPct).toFixed(0)}% remaining</span>
          </div>
        </div>
      </div>

      {/* Bottom row: category breakdown + pie */}
      <div className={styles.bottomRow}>
        {/* Category pills */}
        <div className={styles.categoryList}>
          <div className={styles.sectionTitle}>By Category</div>
          {pieData.length === 0 && (
            <p className={styles.empty}>No expenses yet this month.</p>
          )}
          {pieData.map((c, i) => (
            <div key={c.name} className={styles.categoryItem}>
              <div className={styles.categoryDot} style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
              <span className={styles.categoryName}>{c.name}</span>
              <div className={styles.categoryBar}>
                <div className={styles.categoryBarFill}
                  style={{ width: `${totalExpenses > 0 ? (c.value / totalExpenses) * 100 : 0}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} />
              </div>
              <span className={styles.categoryPct}>
                {totalExpenses > 0 ? ((c.value / totalExpenses) * 100).toFixed(0) : 0}%
              </span>
              <span className={styles.categoryAmount}>{formatCurrency(c.value)}</span>
            </div>
          ))}
        </div>

        {/* Pie chart */}
        {pieData.length > 0 && (
          <div className={styles.pieCard}>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />
                  ))}
                </Pie>
                <Tooltip formatter={v => formatCurrency(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <Button onClick={openAdd}>+ Add Expense</Button>
        <span className={styles.recordCount}>{records.length} record{records.length !== 1 ? 's' : ''} this month</span>
      </div>

      {/* Table */}
      <Table columns={columns} data={records} emptyMessage="No expenses recorded for this month." />

      {/* Modal */}
      {showModal && (
        <Modal
          title={editRecord ? 'Edit Expense' : 'Add Expense'}
          onClose={() => setShowModal(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button onClick={handleSubmit}>Save</Button>
            </>
          }
        >
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.formGrid}>
              <FormField label="Date">
                <Input type="date" value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
              </FormField>
              <FormField label="Category">
                <Select value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
              </FormField>
              <FormField label="Description">
                <Input type="text" placeholder="What was this expense for?"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </FormField>
              <FormField label="Payment Method">
                <Select value={form.payment_method}
                  onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </Select>
              </FormField>
              <FormField label="Amount (₦)">
                <Input type="number" min="0" step="0.01" value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
              </FormField>
            </div>

            {/* Feed purchase details — shown only when category is Feed */}
            {form.category === 'Feed' && (
              <>
                <div style={{ margin: '4px 0 4px', paddingTop: 14, borderTop: '2px solid var(--color-border)', fontSize: 13, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Feed Purchase Details
                </div>
                <div className={styles.formGrid2col}>
                  <FormField label="Feed Type">
                    <Select value={form.feed_type}
                      onChange={e => setForm(f => ({ ...f, feed_type: e.target.value }))}>
                      {FEED_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </Select>
                  </FormField>
                  <FormField label="Bags">
                    <Input type="number" min="0" step="1" placeholder="e.g. 10"
                      value={form.bags}
                      onChange={e => setForm(f => ({ ...f, bags: e.target.value }))} />
                  </FormField>
                  <FormField label="Quantity (kg)">
                    <Input type="number" min="0" step="0.1" placeholder="e.g. 500"
                      value={form.quantity_kg}
                      onChange={e => setForm(f => ({ ...f, quantity_kg: e.target.value }))} />
                  </FormField>
                  <FormField label="Supplier">
                    <Input type="text" placeholder="Supplier name"
                      value={form.supplier}
                      onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} />
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
    </div>
  )
}
