import { useLocation, Link } from 'react-router-dom'

const PAGE_TITLES = {
  '/dashboard':   'ផ្ទាំងគ្រប់គ្រង',
  '/products':    'ផលិតផល',
  '/unit-types':  'ប្រភេទឯកតា',
  '/invoices':    'វិក្កយបត្រ',
  '/purchases':   'ការទិញ',
  '/partners':    'ដៃគូ',
  '/suppliers':   'អ្នកផ្គត់ផ្គង់',
  '/user-prices': 'តម្លៃពិសេស',
  '/reports':     'របាយការណ៍',
  '/stock':       'គ្រប់គ្រងសន្និធិ',
  '/employees':   'បុគ្គលិក',
  '/debts':       'បំណុល',
  '/categories':  'ប្រភេទ',
  '/settings':    'ការកំណត់',
}

export default function Header({ onMenuClick }) {
  const { pathname } = useLocation()
  const title = Object.entries(PAGE_TITLES).find(([k]) => pathname.startsWith(k))?.[1] || ''

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Menu"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 className="text-base font-semibold text-gray-800">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <Link
          to="/invoices/create"
          className="btn-primary text-xs py-1.5 px-3"
        >
          + បង្កើតវិក្កយបត្រ
        </Link>
      </div>
    </header>
  )
}