import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts'
import { reportAPI, invoiceAPI, variantAPI } from '../../api/index.js'
import api from '../../api/Axios.js'
import { formatCurrency, MONTH_NAMES_KH } from '../../utils/formatters.js'
import { StatCard, PageLoader } from '../../components/UI/index.jsx'


const STATUS_COLORS = { paid:'badge-green', pending:'badge-yellow', partial:'badge-blue', cancelled:'badge-red' }
const STATUS_KH     = { paid:'បានបង់', pending:'មិនទាន់', partial:'មួយចំណែក', cancelled:'បានបោះបង់' }
const PIE_COLORS    = ['#4f46e5', '#ef4444']

export default function Dashboard() {
  const [loading,     setLoading]     = useState(true)
  const [monthly,     setMonthly]     = useState([])
  const [rvc,         setRvc]         = useState({})
  const [recentInv,   setRecentInv]   = useState([])
  const [lowStock,    setLowStock]    = useState([])
  const [bestSelling, setBestSelling] = useState([])
  const year = new Date().getFullYear()

  useEffect(() => {
    Promise.all([
      reportAPI.monthly({ year }),
      reportAPI.revenueVsCost({ year }),
      invoiceAPI.list({ limit: 5, sortBy: 'createdAt', order: 'desc' }),
      api.get('/products/low-stock'),
      reportAPI.bestSelling({ limit: 8 }),
    ]).then(([m, r, inv, ls, bs]) => {
      // Monthly chart data
      setMonthly(
        (Array.isArray(m.data?.months) ? m.data.months : []).map((d, i) => ({
          name:   (MONTH_NAMES_KH[i] ?? `${i+1}`).slice(0, 3),
          ចំណូល: d.revenue   ?? 0,
          ចំណាយ: d.totalCost ?? 0,
          ចំណេញ: (d.revenue ?? 0) - (d.totalCost ?? 0),
        }))
      )
      // Revenue vs cost
      setRvc(r.data ?? {})
      // Recent invoices — invoiceAPI.list returns { invoices, pagination }
      setRecentInv(inv.data?.invoices ?? (Array.isArray(inv.data) ? inv.data : []))
      // Low stock — /products/low-stock returns array directly
      setLowStock(Array.isArray(ls.data) ? ls.data : [])
      // Best selling — returns array directly
      setBestSelling(Array.isArray(bs.data) ? bs.data : [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <PageLoader />

  const profitPct = rvc.profitMargin ?? 0
  const pieData   = [
    { name: 'ចំណូល', value: rvc.totalRevenue ?? 0 },
    { name: 'ចំណាយ', value: rvc.totalCost    ?? 0 },
  ]

  return (
    <div className="space-y-6">

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="ចំណូលឆ្នាំ"   value={formatCurrency(rvc.totalRevenue)} icon="💵" color="blue"   sub={`${year}`} />
        <StatCard label="ចំណាយឆ្នាំ"   value={formatCurrency(rvc.totalCost)}    icon="🛒" color="red"    sub={`${year}`} />
        <StatCard label="ប្រាក់ចំណេញ"  value={formatCurrency(rvc.grossProfit)}  icon="📈" color="green"  sub={`${year}`} />
        <StatCard label="ភាគរយចំណេញ"  value={`${profitPct}%`}                  icon="🎯" color="purple" sub="ឆ្នាំ" />
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">ចំណូល vs ចំណាយ ({year})</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthly} margin={{ top:0, right:8, left:-10, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize:11 }} />
              <YAxis tick={{ fontSize:10 }} tickFormatter={v => (v/1000)+'K'} />
              <Tooltip formatter={v => formatCurrency(v)} labelStyle={{ fontFamily:'Noto Sans Khmer' }} />
              <Bar dataKey="ចំណូល"  fill="#4f46e5" radius={[3,3,0,0]} />
              <Bar dataKey="ចំណាយ" fill="#ef4444" radius={[3,3,0,0]} />
              <Bar dataKey="ចំណេញ" fill="#22c55e" radius={[3,3,0,0]} />
              <Legend wrapperStyle={{ fontSize:12 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">សង្ខេបឆ្នាំ</h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={65} dataKey="value"
                label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}
                labelLine={false} fontSize={11}>
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
            <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-gray-600">ចំណេញ</span>
              </div>
              <span className="font-bold text-green-600">{formatCurrency(rvc.grossProfit ?? 0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Best selling + Low stock ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Best selling */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">🏆 ផលិតផលលក់ដាច់បំផុត</h3>
            <Link to="/reports" className="text-xs text-primary-600 hover:underline">របាយការណ៍ពេញ</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header text-center w-8">#</th>
                  <th className="table-header text-left">ផលិតផល / ម៉ាក</th>
                  <th className="table-header text-left">SKU</th>
                  <th className="table-header text-right">បរិមាណ</th>
                  <th className="table-header text-right">ចំណូល</th>
                </tr>
              </thead>
              <tbody>
                {bestSelling.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-sm text-gray-400 py-8">គ្មានទិន្នន័យ</td></tr>
                )}
                {bestSelling.map((p, i) => (
                  <tr key={p._id ?? i} className="hover:bg-gray-50">
                    <td className="table-cell text-center">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="text-gray-400 font-semibold text-xs">{i+1}</span>}
                    </td>
                    <td className="table-cell">
                      <p className="font-medium text-gray-800">{p.productName}</p>
                      {p.brand && <p className="text-xs text-gray-400">{p.brand}</p>}
                    </td>
                    <td className="table-cell font-mono text-xs text-gray-400">{p.sku}</td>
                    <td className="table-cell text-right font-semibold">{p.totalQuantity} <span className="text-xs text-gray-400">{p.unit}</span></td>
                    <td className="table-cell text-right font-semibold text-green-600">{formatCurrency(p.totalRevenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low stock */}
        <div className="card">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">⚠️ ស្ទុំទាប</h3>
            <Link to="/stock" className="text-xs text-primary-600 hover:underline">ពិនិត្យ</Link>
          </div>
          <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
            {lowStock.length === 0
              ? <p className="text-center text-sm text-gray-400 py-8">✅ ស្ទុំគ្រប់គ្រាន់</p>
              : lowStock.slice(0, 8).map(v => (
                  <div key={v._id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-700 truncate">{v.product?.name ?? v.sku}</p>
                      <p className="text-xs text-gray-400">{v.unitValue} {v.unit}{v.brand ? ` · ${v.brand}` : ''}</p>
                    </div>
                    <span className="badge-red text-xs ml-2 shrink-0">{v.stock} នៅ</span>
                  </div>
                ))
            }
          </div>
        </div>
      </div>

      {/* ── Recent invoices ── */}
      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">🧾 វិក្កយបត្រចុងក្រោយ</h3>
          <Link to="/invoices" className="text-xs text-primary-600 hover:underline">មើលទាំងអស់</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header text-left">លេខ</th>
                <th className="table-header text-left">អតិថិជន</th>
                <th className="table-header text-center">ស្ថានភាព</th>
                <th className="table-header text-right">សរុប</th>
                <th className="table-header text-left">ថ្ងៃ</th>
              </tr>
            </thead>
            <tbody>
              {recentInv.length === 0 && (
                <tr><td colSpan={5} className="text-center text-sm text-gray-400 py-8">គ្មានទិន្នន័យ</td></tr>
              )}
              {recentInv.map(inv => (
                <tr key={inv._id} className="hover:bg-gray-50">
                  <td className="table-cell">
                    <Link to={`/invoices/${inv._id}`} className="text-indigo-600 hover:underline font-mono text-xs">{inv.invoiceNumber}</Link>
                  </td>
                  <td className="table-cell text-gray-700 text-sm">{inv.customerName || '—'}</td>
                  <td className="table-cell text-center">
                    <span className={STATUS_COLORS[inv.status] ?? 'badge-gray'}>{STATUS_KH[inv.status] ?? inv.status}</span>
                  </td>
                  <td className="table-cell text-right font-semibold text-green-600">{formatCurrency(inv.total)}</td>
                  <td className="table-cell text-xs text-gray-400">{new Date(inv.createdAt).toLocaleDateString('km-KH')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t border-gray-100">
          <Link to="/invoices/create" className="btn-primary w-full justify-center text-sm">
            + បង្កើតវិក្កយបត្រថ្មី
          </Link>
        </div>
      </div>

    </div>
  )
}