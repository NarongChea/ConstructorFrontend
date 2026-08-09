import { useEffect, useState, useCallback } from 'react'
import { stockAPI } from '../../api/index.js'
import { formatDate } from '../../utils/formatters.js'
import Pagination from '../../components/UI/Pagination.jsx'
import { EmptyState, PageLoader, SearchBar } from '../../components/UI/index.jsx'

export default function StockList() {
  const [history, setHistory]     = useState([])
  const [pagination, setPagination] = useState(null)
  const [loading, setLoading]     = useState(true)
  const [page, setPage]           = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await stockAPI.history({ page, limit: 20 })
      setHistory(res.data?.history ?? [])
      setPagination(res.data?.pagination ?? null)
    } catch { } finally { setLoading(false) }
  }, [page])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">ប្រវត្តិសន្និធិ</h2>
        </div>
        {loading ? <PageLoader /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header text-left">SKU</th>
                    <th className="table-header text-left">ប្រភេទ</th>
                    <th className="table-header text-right">ការផ្លាស់ប្ដូរ</th>
                    <th className="table-header text-right">សន្និធិក្រោយ</th>
                    <th className="table-header text-left">ហេតុផល</th>
                    <th className="table-header text-left">កាលបរិច្ឆេទ</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 && (
                    <tr><td colSpan={6}><EmptyState icon="🏪" title="គ្មានប្រវត្តិ" /></td></tr>
                  )}
                  {history.map((h, i) => (
                    <tr key={h._id || i} className="hover:bg-gray-50">
                      <td className="table-cell font-mono text-xs">{h.variantId?.sku || h.sku || '—'}</td>
                      <td className="table-cell">
                        <span className={h.type === 'in' ? 'badge-green' : 'badge-red'}>
                          {h.type === 'in' ? '▲ ចូល' : '▼ ចេញ'}
                        </span>
                      </td>
                      <td className={`table-cell text-right font-semibold ${h.change > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {h.change > 0 ? '+' : ''}{h.change}
                      </td>
                      <td className="table-cell text-right">{h.stockAfter}</td>
                      <td className="table-cell text-sm text-gray-500">{h.reason || '—'}</td>
                      <td className="table-cell text-xs text-gray-400">{formatDate(h.createdAt)}</td>
                    </tr>
                  ))}
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
