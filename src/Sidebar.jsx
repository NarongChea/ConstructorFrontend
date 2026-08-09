import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'

const NAV = [
  {
    group: 'ទូទៅ',
    items: [
      { to: '/dashboard',  icon: '📊', label: 'ផ្ទាំងគ្រប់គ្រង' },
    ]
  },
  {
    group: 'ការលក់',
    items: [
      { to: '/invoices',  icon: '🧾', label: 'វិក្កយបត្រ' },
      { to: '/partners',  icon: '🤝', label: 'ដៃគូ' },
      { to: '/user-prices', icon: '💲', label: 'តម្លៃពិសេស' },
    ]
  },
  {
    group: 'ការទិញ',
    items: [
      { to: '/purchases', icon: '🛒', label: 'ការទិញ' },
      { to: '/suppliers', icon: '🏭', label: 'អ្នកផ្គត់ផ្គង់' },
    ]
  },
  {
    group: 'ផលិតផល',
    items: [
      { to: '/products',   icon: '📦', label: 'ផលិតផល' },
      { to: '/unit-types', icon: '📐', label: 'ប្រភេទឯកតា' },
      { to: '/categories', icon: '🗂️', label: 'ប្រភេទ' },
      { to: '/locations',  icon: '📍', label: 'ទីកន្លែង' },
      { to: '/stock',      icon: '🏪', label: 'សន្និធិ' },
    ]
  },
  {
    group: 'ហិរញ្ញវត្ថុ',
    items: [
      { to: '/debts',     icon: '💰', label: 'បំណុល' },
      { to: '/employees', icon: '👥', label: 'បុគ្គលិក' },
    ]
  },
  {
    group: 'របាយការណ៍',
    items: [
      { to: '/reports', icon: '📈', label: 'របាយការណ៍' },
    ]
  },
  {
    group: 'ប្រព័ន្ធ',
    items: [
      { to: '/activity-logs', icon: '📜', label: 'កំណត់ហេតុសកម្មភាព' },
      { to: '/settings',       icon: '⚙️', label: 'ការកំណត់' },
    ]
  },
]

export default function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth()

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-20 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-gray-900 text-white z-30
        transform transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:z-auto
        flex flex-col
      `}>
        <div className="flex items-center gap-3 p-5 border-b border-gray-800">
          <div className="w-9 h-9 bg-primary-600 rounded-lg flex items-center justify-center text-lg font-bold">
            🏗
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">ក្រុមហ៊ុនសំណង់</p>
            <p className="text-xs text-gray-400">ប្រព័ន្ធគ្រប់គ្រង</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {NAV.map(group => (
            <div key={group.group} className="mb-4">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider px-3 mb-1">
                {group.group}
              </p>
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors mb-0.5
                    ${isActive
                      ? 'bg-primary-600 text-white font-medium'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                    }`
                  }
                >
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-800">
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center text-xs font-bold">
              {user?.name?.[0] || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name || 'Admin'}</p>
              <p className="text-xs text-gray-400 truncate">{user?.role || 'admin'}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-red-400 transition-colors"
          >
            <span>🚪</span>
            <span>ចាកចេញ</span>
          </button>
        </div>
      </aside>
    </>
  )
}