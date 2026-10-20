import dayjs from 'dayjs'

export function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '₦0'
  return '₦' + Number(amount).toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

export function formatEggs(totalPieces) {
  const crates = Math.floor(totalPieces / 30)
  const pieces = totalPieces % 30
  if (crates === 0) return `${pieces} pcs`
  if (pieces === 0) return `${crates} crates`
  return `${crates} crates, ${pieces} pcs`
}

export function formatDate(dateStr) {
  return dayjs(dateStr).format('DD MMM YYYY')
}

export function formatMonthYear(monthYear) {
  return dayjs(monthYear + '-01').format('MMMM YYYY')
}

export function currentMonthYear() {
  return dayjs().format('YYYY-MM')
}

export function toMonthYear(dateStr) {
  return dayjs(dateStr).format('YYYY-MM')
}

export const LAYER_LABELS = {
  L1: 'Old Layers (L1)',
  L2: 'New Layers (L2)',
}

export const EGG_SIZES = ['Small', 'Medium', 'Big', 'Others']
export const PAYMENT_METHODS = ['Cash', 'Transfer', 'POS', 'Cheque']
export const EXPENSE_CATEGORIES = [
  'Feed', 'Medication', 'Labour', 'Utilities',
  'Equipment', 'Transport', 'Maintenance', 'Miscellaneous',
]
