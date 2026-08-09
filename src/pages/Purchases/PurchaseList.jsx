import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { purchaseAPI } from '../../api/index.js'
import { formatCurrency, formatDateTime, SOURCE_TYPE } from '../../utils/formatters.js'
import Pagination from '../../components/UI/Pagination.jsx'
import { EmptyState, PageLoader, SearchBar } from '../../components/UI/index.jsx'

export default function PurchaseList() {
  const [purchases,  setPurchases]  = useState([])
  const [pagination, setPagination] = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [sourceType, setSourceType] = useState('')
  const [startDate,  setStartDate]  = useState('')
  const [endDate,    setEndDate]    = useState('')
  const [page,       setPage]       = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await purchaseAPI.list({
        page, limit: 20,
        sourceType: sourceType || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      })
      setPurchases(res.data?.purchases ?? [])
      setPagination(res.data?.pagination ?? null)
    } catch { } finally { setLoading(false) }
  }, [page, sourceType, startDate, endDate])

  useEffect(() => { load() }, [load])

  const totalShown = purchases.reduce((s, p) => s + p.totalCost, 0)

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="p-4 border-b border-gray-100 flex flex-wrap gap-2">
          <select value={sourceType} onChange={e => { setSourceType(e.target.value); setPage(1) }} className="input-field text-sm py-2 w-40">
            <option value="">ប្រភពទាំងអស់</option>
            <option value="supplier">អ្នកផ្គត់ផ្គង់</option>
            <option value="partner">ដៃគូ</option>
          </select>
          <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1) }} className="input-field text-sm py-2" />
          <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1) }} className="input-field text-sm py-2" />
          <div className="flex-1" />
          <Link to="/purchases/create" className="btn-primary whitespace-nowrap">+ ការទិញថ្មី</Link>
        </div>

        {purchases.length > 0 && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-100 flex items-center gap-4 text-sm">
            <span className="text-red-700">សរុបចំណាយ:</span>
            <span className="font-semibold text-red-800">{formatCurrency(totalShown)}</span>
            <span className="text-red-600">({purchases.length} ការទិញ)</span>
          </div>
        )}

        {loading ? <PageLoader /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header text-left">ប្រភព</th>
                    <th className="table-header text-left">ឈ្មោះ</th>
                    <th className="table-header text-right">ចំនួនទំនិញ</th>
                    <th className="table-header text-right">ចំណាយសរុប</th>
                    <th className="table-header text-left">ចំណាំ</th>
                    <th className="table-header text-left">កាលបរិច្ឆេទ</th>
                    <th className="table-header text-center">សកម្មភាព</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.length === 0 && (
                    <tr><td colSpan={7}><EmptyState icon="🛒" title="គ្មានការទិញ" /></td></tr>
                  )}
                  {purchases.map(p => {
                    const src = SOURCE_TYPE[p.sourceType] || SOURCE_TYPE.supplier
                    return (
                      <tr key={p._id} className="hover:bg-gray-50">
                        <td className="table-cell"><span className={src.cls}>{src.label}</span></td>
                        <td className="table-cell">
                          <p className="font-medium text-gray-800">{p.supplierName || p.partnerName || '—'}</p>
                        </td>
                        <td className="table-cell text-right text-gray-500">{p.items?.length || '—'}</td>
                        <td className="table-cell text-right font-semibold text-red-700">{formatCurrency(p.totalCost)}</td>
                        <td className="table-cell text-gray-400 text-sm">{p.note || '—'}</td>
                        <td className="table-cell text-xs text-gray-500">{formatDateTime(p.createdAt)}</td>
                        <td className="table-cell text-center">
                          <Link to={`/purchases/${p._id}`} className="p-1.5 text-primary-600 hover:bg-primary-50 rounded-lg inline-flex text-sm">👁️</Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination pagination={pagination} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  )
}