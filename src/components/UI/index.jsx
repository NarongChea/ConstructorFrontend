export function Badge({ children, variant = 'gray' }) {
  const cls = {
    green:  'badge-green',
    red:    'badge-red',
    yellow: 'badge-yellow',
    blue:   'badge-blue',
    gray:   'badge-gray',
    purple: 'badge-purple',
  }
  return <span className={cls[variant] || 'badge-gray'}>{children}</span>
}

export function StatCard({ label, value, icon, color = 'blue', sub }) {
  const colors = {
    blue:   'bg-blue-50   text-blue-600',
    green:  'bg-green-50  text-green-600',
    red:    'bg-red-50    text-red-600',
    purple: 'bg-purple-50 text-purple-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    indigo: 'bg-indigo-50 text-indigo-600',
  }
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        {icon && (
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg ${colors[color]}`}>
            {icon}
          </div>
        )}
      </div>
      <p className="text-2xl font-semibold text-gray-800">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export function EmptyState({ icon = '📭', title, message }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-5xl mb-3">{icon}</div>
      <p className="text-gray-600 font-medium">{title || 'គ្មានទិន្នន័យ'}</p>
      {message && <p className="text-sm text-gray-400 mt-1">{message}</p>}
    </div>
  )
}

export function Spinner({ size = 'md' }) {
  const s = { sm: 'w-4 h-4 border-2', md: 'w-6 h-6 border-2', lg: 'w-10 h-10 border-4' }
  return (
    <div className="flex items-center justify-center p-4">
      <div className={`${s[size]} border-primary-600 border-t-transparent rounded-full animate-spin`} />
    </div>
  )
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-sm text-gray-400">កំពុងផ្ទុក...</p>
      </div>
    </div>
  )
}

export function SearchBar({ value, onChange, placeholder = 'ស្វែងរក...' }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="input-field pl-9 pr-4 py-2 text-sm w-full sm:w-64"
      />
    </div>
  )
}

export function FormField({ label, required, error, children, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

export function SectionHeader({ title, action }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{title}</h2>
      {action}
    </div>
  )
}