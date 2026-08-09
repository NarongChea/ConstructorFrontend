import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend
} from 'recharts'
import { reportAPI, invoiceAPI, purchaseAPI, variantAPI } from '../../api/index.js'
import { formatCurrency, MONTH_NAMES_KH } from '../../utils/formatters.js'
import { StatCard, PageLoader } from '../../components/UI/index.jsx'

export default function Dashboard() {
  const [loading, setLoading]     = useState(true)
  const [monthly, setMonthly]     = useState([])
  const [revenueVsCost, setRVC]   = useState(null)
  const [recentInvoices, setRI]   = useState([])
  const [lowStock, setLS]         = useState([])
  const [bestSelling, setBS]      = useState([])
  const year = new Date().getFullYear()

  useEffect(() => {
    Promise.all([
      reportAPI.monthly({ year }),
      reportAPI.revenueVsCost({ year }),
      invoiceAPI.list({ limit: 5, status: 'paid' }),
      variantAPI.lowStock(),
      reportAPI.bestSelling({ limit: 5 }),
    ]).then(([m, rvc, inv, ls, bs]) => {
      setMonthly(m.data?.months?.map((d, i) => ({
        name: MONTH_NAMES_KH[i].slice(0,3),
        ចំណូល: d.revenue,
        ចំណាយ: d.totalCost,
      })) || [])
      setRVC(rvc.data ?? null)
      setRI(inv.data?.invoices ?? [])
      setLS(ls.data?.variants ?? [])
      setBS(bs.data ?? [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <PageLoader />

  const rvc = revenueVsCost || {}
  const profitPct = rvc.profitMargin || 0
  const pieData = [
    { name: 'ចំណូល',  value: rvc.totalRevenue  || 0 },
    { name: 'ចំណាយ', value: rvc.totalCost      || 0 },
  ]
  const PIE_COLORS = ['#4f46e5', '#ef4444']

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="ចំណូលឆ្នាំ" value={formatCurrency(rvc.totalRevenue)} icon="💵" color="blue" sub={`${year}`} />
        <StatCard label="ចំណាយឆ្នាំ"  value={formatCurrency(rvc.totalCost)}    icon="🛒" color="red"    sub={`${year}`} />
        <StatCard label="ប្រាក់ចំណេញ" value={formatCurrency(rvc.grossProfit)}   icon="📈" color="green"  sub={`${year}`} />
        <StatCard label="ភាគរយចំណេញ"  value={`${profitPct}%`}                  icon="🎯" color="purple" sub="ឆ្នាំ" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">ចំណូល vs ចំណាយ ({year})</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthly} margin={{ top: 0, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => (v / 1000) + 'K'} />
              <Tooltip formatter={v => formatCurrency(v)} labelStyle={{ fontFamily: 'Noto Sans Khmer' }} />
              <Bar dataKey="ចំណូល"  fill="#4f46e5" radius={[3,3,0,0]} />
              <Bar dataKey="ចំណាយ" fill="#ef4444" radius={[3,3,0,0]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">សង្ខេបឆ្នាំ</h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={65} dataKey="value" label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
              </Pie>
              <Tooltip formatter={v => formatCurrency(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-3 space-y-2">
            {pieData.map((d, i) => (
              <div key={d.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: PIE_COLORS[i] }} />
                  <span className="text-gray-600">{d.name}</span>
                </div>
                <span className="font-medium text-gray-700">{formatCurrency(d.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent invoices */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">វិក្កយបត្រចុងក្រោយ</h3>
            <Link to="/invoices" className="text-xs text-primary-600 hover:underline">មើលទាំងអស់</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentInvoices.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-8">គ្មានទិន្នន័យ</p>
            )}
            {recentInvoices.map(inv => (
              <Link key={inv._id} to={`/invoices/${inv._id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                <div>
                  <p className="text-sm font-medium text-gray-700">{inv.invoiceNumber}</p>
                  <p className="text-xs text-gray-400">{inv.customerName}</p>
                </div>
                <p className="text-sm font-semibold text-green-600">{formatCurrency(inv.total)}</p>
              </Link>
            ))}
          </div>
          <div className="p-3 border-t border-gray-100">
            <Link to="/invoices/create" className="btn-primary w-full justify-center text-sm">
              + បង្កើតវិក្កយបត្រថ្មី
            </Link>
          </div>
        </div>

        {/* Low stock */}
        <div className="card">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">⚠️ ស្ទុំហើយ</h3>
            <Link to="/stock" className="text-xs text-primary-600 hover:underline">ពិនិត្យ</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {lowStock.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-6">✅ ស្ទុំគ្រប់គ្រាន់</p>
            )}
            {lowStock.slice(0,6).map(v => (
              <div key={v._id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-xs font-medium text-gray-700">{v.sku}</p>
                  <p className="text-xs text-gray-400">{v.unit}</p>
                </div>
                <span className="badge-red text-xs">{v.stock}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Best selling */}
      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">🏆 ផលិតផលលក់ដាច់</h3>
          <Link to="/reports" className="text-xs text-primary-600 hover:underline">របាយការណ៍ពេញ</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header text-left">#</th>
                <th className="table-header text-left">ផលិតផល</th>
                <th className="table-header text-left">SKU</th>
                <th className="table-header text-right">បរិមាណ</th>
                <th className="table-header text-right">ចំណូល</th>
              </tr>
            </thead>
            <tbody>
              {bestSelling.length === 0 && (
                <tr><td colSpan={5} className="text-center text-sm text-gray-400 py-6">គ្មានទិន្នន័យ</td></tr>
              )}
              {bestSelling.map((p, i) => (
                <tr key={p._id} className="hover:bg-gray-50">
                  <td className="table-cell font-semibold text-gray-400">{i+1}</td>
                  <td className="table-cell font-medium">{p.productName}</td>
                  <td className="table-cell text-gray-400 font-mono text-xs">{p.sku}</td>
                  <td className="table-cell text-right">{p.totalQuantity} {p.unit}</td>
                  <td className="table-cell text-right font-semibold text-green-600">{formatCurrency(p.totalRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}