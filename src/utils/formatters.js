import { format, formatDistanceToNow } from 'date-fns'

export const formatCurrency = (amount) => {
  if (amount === null || amount === undefined) return '0 រៀល'
  return new Intl.NumberFormat('km-KH').format(Math.round(amount)) + ' ៛'
}

export const formatNumber = (n) => new Intl.NumberFormat('km-KH').format(n ?? 0)

export const formatDate = (date) => {
  if (!date) return '-'
  return format(new Date(date), 'dd/MM/yyyy')
}

export const formatDateTime = (date) => {
  if (!date) return '-'
  return format(new Date(date), 'dd/MM/yyyy HH:mm')
}

export const formatRelative = (date) => {
  if (!date) return '-'
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

export const MONTH_NAMES_KH = [
  'មករា','កុម្ភៈ','មីនា','មេសា','ឧសភា','មិថុនា',
  'កក្កដា','សីហា','កញ្ញា','តុលា','វិច្ឆិកា','ធ្នូ'
]

// ── Invoice status ──────────────────────────────────────────────────────────
// Backend ផ្ញើ raw values: "paid" | "partial" | "pending" | "cancelled"
// paid     → depositAmount >= total   (ទូទាត់ពេញ)
// partial  → 0 < depositAmount < total (មានកក់ខ្លះ — រងចាំ)
// pending  → depositAmount === 0      (មិនទាន់ទូទាត់សោះ)
// cancelled → បោះបង់
export const INVOICE_STATUS = {
  paid:      { label: 'បានទូទាត់ពេញ',  cls: 'badge-green'  },
  partial:   { label: 'រងចាំ',           cls: 'badge-yellow' },
  pending:   { label: 'មិនទាន់ទូទាត់',  cls: 'badge-red'    },
  cancelled: { label: 'បោះបង់',          cls: 'badge-gray'   },
}

export const DEBT_STATUS = {
  pending: { label: 'មិនទាន់បង់',   cls: 'badge-red'    },
  partial: { label: 'បង់មួយភាគ',   cls: 'badge-yellow' },
  settled: { label: 'បានបង់ស្រុង', cls: 'badge-green'  },
}

export const SOURCE_TYPE = {
  supplier: { label: 'អ្នកផ្គត់ផ្គង់', cls: 'badge-blue'   },
  partner:  { label: 'ដៃគូ',           cls: 'badge-purple' },
}

export const INVOICE_TYPE = {
  customer: { label: 'អតិថិជន', cls: 'badge-blue'   },
  partner:  { label: 'ដៃគូ',   cls: 'badge-purple' },
}

export const truncate = (str, n = 30) => str && str.length > n ? str.slice(0, n) + '...' : str || '-'