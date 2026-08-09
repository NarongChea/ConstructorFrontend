import { useEffect, useState } from 'react'
import { reportAPI } from '../../api/index.js'
import { formatCurrency, MONTH_NAMES_KH } from '../../utils/formatters.js'
import { StatCard, PageLoader } from '../../components/UI/index.jsx'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

const TABS = ['ប្រចាំថ្ងៃ','ប្រចាំខែ','ប្រចាំឆ្នាំ','ដៃគូ-លក់','ដៃគូ-ទិញ','ចំណាយ','ផលិតផល']

export default function ReportPage() {
  const [tab,       setTab]       = useState(0)
  const [loading,   setLoading]   = useState(false)
  const [data,      setData]      = useState(null)
  const year = new Date().getFullYear()
  const [selYear,   setSelYear]   = useState(year)
  const [startDate, setStartDate] = useState('')
  const [endDate,   setEndDate]   = useState('')

  useEffect(() => { fetchData() }, [tab, selYear, startDate, endDate])

  const fetchData = async () => {
    setLoading(true); setData(null)
    try {
      let res
      const dateP = { startDate: startDate || undefined, endDate: endDate || undefined }
      if (tab === 0) res = await reportAPI.daily(dateP)
      if (tab === 1) res = await reportAPI.monthly({ year: selYear })
      if (tab === 2) res = await reportAPI.yearly({ startYear: selYear - 4, endYear: selYear })
      if (tab === 3) res = await reportAPI.partnerSales(dateP)
      if (tab === 4) res = await reportAPI.partnerPurchases(dateP)
      if (tab === 5) res = await reportAPI.spending({ year: selYear })
      if (tab === 6) res = await reportAPI.bestSelling({ ...dateP, limit: 20 })
      setData(res?.data ?? null)
    } catch { } finally { setLoading(false) }
  }

  const TOOLTIP_STYLE = { fontFamily: 'Noto Sans Khmer', fontSize: 12 }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="card p-1.5">
        <div className="flex overflow-x-auto gap-1">
          {TABS.map((t, i) => (
            <button key={i} onClick={() => setTab(i)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${tab===i ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="card p-3 flex flex-wrap gap-3">
        {(tab === 1 || tab === 2 || tab === 5) && (
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">ឆ្នាំ:</label>
            <select value={selYear} onChange={e => setSelYear(+e.target.value)} className="input-field text-sm py-1.5 w-24">
              {Array.from({length:6},(_,i)=>year-i).map(y=><option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}
        {(tab === 0 || tab === 3 || tab === 4 || tab === 6) && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">ពី:</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input-field text-sm py-1.5" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">ដល់:</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input-field text-sm py-1.5" />
            </div>
          </>
        )}
        <button onClick={fetchData} className="btn-secondary text-sm py-1.5">🔄 ធ្វើបច្ចុប្បន្នភាព</button>
      </div>

      {loading ? <PageLoader /> : !data ? null : (
        <>
          {/* Daily */}
          {tab === 0 && Array.isArray(data) && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">ចំណូលប្រចាំថ្ងៃ</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.map(d => ({ date: d._id, ចំណូល: d.revenue, Invoices: d.invoiceCount }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => (v/1000)+'K'} />
                  <Tooltip formatter={v => formatCurrency(v)} contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="ចំណូល" fill="#4f46e5" radius={[3,3,0,0]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr>
                    <th className="table-header text-left">ថ្ងៃ</th>
                    <th className="table-header text-right">ចំណូល</th>
                    <th className="table-header text-right">វិក្កយបត្រ</th>
                    <th className="table-header text-right">អតិថិជន</th>
                    <th className="table-header text-right">ដៃគូ</th>
                  </tr></thead>
                  <tbody>{data.map(d=>(
                    <tr key={d._id} className="hover:bg-gray-50">
                      <td className="table-cell font-mono text-xs">{d._id}</td>
                      <td className="table-cell text-right font-semibold text-green-600">{formatCurrency(d.revenue)}</td>
                      <td className="table-cell text-right">{d.invoiceCount}</td>
                      <td className="table-cell text-right text-blue-600">{formatCurrency(d.customerSales)}</td>
                      <td className="table-cell text-right text-purple-600">{formatCurrency(d.partnerSales)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          {/* Monthly */}
          {tab === 1 && data.months && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label:'ចំណូលសរុប',  value: data.months.reduce((s,m)=>s+m.revenue,0),   color:'blue'  },
                  { label:'ចំណាយសរុប',  value: data.months.reduce((s,m)=>s+m.totalCost,0), color:'red'   },
                  { label:'ចំណេញ',      value: data.months.reduce((s,m)=>s+m.profit,0),    color:'green' },
                  { label:'ចំណូលដៃគូ',  value: data.months.reduce((s,m)=>s+m.partnerSales,0), color:'purple'},
                ].map(s => <StatCard key={s.label} label={s.label} value={formatCurrency(s.value)} color={s.color} />)}
              </div>
              <div className="card p-5">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.months.map((m,i)=>({ name: MONTH_NAMES_KH[i].slice(0,3), ចំណូល:m.revenue, ចំណាយ:m.totalCost, ចំណេញ:m.profit }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{fontSize:11}} />
                    <YAxis tick={{fontSize:10}} tickFormatter={v=>(v/1000)+'K'} />
                    <Tooltip formatter={v=>formatCurrency(v)} contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="ចំណូល"  fill="#4f46e5" radius={[3,3,0,0]} />
                    <Bar dataKey="ចំណាយ" fill="#ef4444" radius={[3,3,0,0]} />
                    <Bar dataKey="ចំណេញ" fill="#22c55e" radius={[3,3,0,0]} />
                    <Legend wrapperStyle={{fontSize:12}} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Yearly */}
          {tab === 2 && data.years && (
            <div className="space-y-4">
              <div className="card p-5">
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={data.years.map(y=>({ name:y.year, ចំណូល:y.revenue, ចំណាយ:y.totalCost, ចំណេញ:y.profit }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{fontSize:11}} />
                    <YAxis tick={{fontSize:10}} tickFormatter={v=>(v/1000000)+'M'} />
                    <Tooltip formatter={v=>formatCurrency(v)} contentStyle={TOOLTIP_STYLE} />
                    <Line type="monotone" dataKey="ចំណូល"  stroke="#4f46e5" strokeWidth={2} dot />
                    <Line type="monotone" dataKey="ចំណាយ" stroke="#ef4444" strokeWidth={2} dot />
                    <Line type="monotone" dataKey="ចំណេញ" stroke="#22c55e" strokeWidth={2} dot />
                    <Legend wrapperStyle={{fontSize:12}} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr>
                    <th className="table-header text-left">ឆ្នាំ</th>
                    <th className="table-header text-right">ចំណូល</th>
                    <th className="table-header text-right">ចំណាយ</th>
                    <th className="table-header text-right">ចំណេញ</th>
                    <th className="table-header text-right">ដៃគូ-លក់</th>
                    <th className="table-header text-right">វិក្កយបត្រ</th>
                  </tr></thead>
                  <tbody>{data.years.map(y=>(
                    <tr key={y.year} className="hover:bg-gray-50">
                      <td className="table-cell font-semibold">{y.year}</td>
                      <td className="table-cell text-right text-green-600 font-semibold">{formatCurrency(y.revenue)}</td>
                      <td className="table-cell text-right text-red-500">{formatCurrency(y.totalCost)}</td>
                      <td className="table-cell text-right font-bold text-gray-800">{formatCurrency(y.profit)}</td>
                      <td className="table-cell text-right text-purple-600">{formatCurrency(y.partnerSales)}</td>
                      <td className="table-cell text-right">{y.invoiceCount}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          {/* Partner Sales */}
          {tab === 3 && data.summary && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <StatCard label="ចំណូលដៃគូ"     value={formatCurrency(data.summary.totalRevenue)}  color="blue"  />
                <StatCard label="ចំនួនវិក្កយបត្រ" value={data.summary.invoiceCount}                color="purple"/>
                <StatCard label="មធ្យម/វិក្កយបត្រ" value={formatCurrency(data.summary.avgOrderValue)} color="green" />
              </div>
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr>
                    <th className="table-header text-left">ដៃគូ</th>
                    <th className="table-header text-right">ចំណូល</th>
                    <th className="table-header text-right">វិក្កយបត្រ</th>
                  </tr></thead>
                  <tbody>{(data.byPartner||[]).map(p=>(
                    <tr key={p._id} className="hover:bg-gray-50">
                      <td className="table-cell font-medium">{p.partnerName}</td>
                      <td className="table-cell text-right font-semibold text-green-600">{formatCurrency(p.totalRevenue)}</td>
                      <td className="table-cell text-right">{p.invoiceCount}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          {/* Partner Purchases */}
          {tab === 4 && data.summary && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <StatCard label="ចំណាយចំពោះដៃគូ"  value={formatCurrency(data.summary.totalSpend)}    color="red"  />
                <StatCard label="ចំនួនការទិញ"        value={data.summary.purchaseCount}               color="purple"/>
              </div>
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr>
                    <th className="table-header text-left">ដៃគូ</th>
                    <th className="table-header text-right">ចំណាយ</th>
                    <th className="table-header text-right">ការទិញ</th>
                  </tr></thead>
                  <tbody>{(data.byPartner||[]).map(p=>(
                    <tr key={p._id} className="hover:bg-gray-50">
                      <td className="table-cell font-medium">{p.partnerName}</td>
                      <td className="table-cell text-right font-semibold text-red-600">{formatCurrency(p.totalSpend)}</td>
                      <td className="table-cell text-right">{p.purchaseCount}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          {/* Spending */}
          {tab === 5 && data.summary && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="ចំណាយសរុប"         value={formatCurrency(data.summary.totalSpend)}    color="red"    />
                <StatCard label="ចំណាយអ្នកផ្គត់ផ្គង់" value={formatCurrency(data.summary.supplierSpend)} color="blue"   />
                <StatCard label="ចំណាយដៃគូ"           value={formatCurrency(data.summary.partnerSpend)}  color="purple" />
                <StatCard label="ចំនួនការទិញ"          value={data.summary.purchaseCount}                color="yellow" />
              </div>
              <div className="card p-5">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={(data.byMonth||[]).map(m=>({ name:m._id, អ្នកផ្គត់ផ្គង់:m.supplierSpend, ដៃគូ:m.partnerSpend }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{fontSize:10}} />
                    <YAxis tick={{fontSize:10}} tickFormatter={v=>(v/1000)+'K'} />
                    <Tooltip formatter={v=>formatCurrency(v)} contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="អ្នកផ្គត់ផ្គង់" fill="#3b82f6" radius={[3,3,0,0]} />
                    <Bar dataKey="ដៃគូ"            fill="#8b5cf6" radius={[3,3,0,0]} />
                    <Legend wrapperStyle={{fontSize:12}} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Best Selling */}
          {tab === 6 && Array.isArray(data) && (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr>
                  <th className="table-header text-left">#</th>
                  <th className="table-header text-left">ផលិតផល</th>
                  <th className="table-header text-left">SKU</th>
                  <th className="table-header text-left">ប្រភេទ</th>
                  <th className="table-header text-right">បរិមាណ</th>
                  <th className="table-header text-right">ចំណូល</th>
                  <th className="table-header text-right">ចំនួនពេល</th>
                </tr></thead>
                <tbody>{data.map((p,i)=>(
                  <tr key={p._id} className="hover:bg-gray-50">
                    <td className="table-cell font-bold text-gray-400">{i+1}</td>
                    <td className="table-cell font-medium">{p.productName}</td>
                    <td className="table-cell font-mono text-xs text-gray-400">{p.sku}</td>
                    <td className="table-cell text-gray-500">{p.unitTypeName || '—'}</td>
                    <td className="table-cell text-right">{p.totalQuantity} {p.unit}</td>
                    <td className="table-cell text-right font-semibold text-green-600">{formatCurrency(p.totalRevenue)}</td>
                    <td className="table-cell text-right">{p.orderCount}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}