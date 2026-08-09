import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { invoiceAPI } from '../../api/index.js'
import { formatCurrency, formatDateTime, INVOICE_STATUS, INVOICE_TYPE } from '../../utils/formatters.js'
import { useDebounce } from '../../hooks/useDebounce.js'
import Pagination from '../../components/UI/Pagination.jsx'
import { EmptyState, PageLoader, SearchBar } from '../../components/UI/index.jsx'

export default function InvoiceList() {
  const [invoices,   setInvoices]   = useState([])
  const [pagination, setPagination] = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [status,     setStatus]     = useState('')
  const [invoiceType,setInvoiceType]= useState('')
  const [startDate,  setStartDate]  = useState('')
  const [endDate,    setEndDate]    = useState('')
  const [page,       setPage]       = useState(1)
  const dSearch = useDebounce(search, 400)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await invoiceAPI.list({
        page, limit: 20, search: dSearch || undefined,
        status: status || undefined, invoiceType: invoiceType || undefined,
        startDate: startDate || undefined, endDate: endDate || undefined,
      })
      setInvoices(res.data?.invoices ?? [])
      setPagination(res.data?.pagination ?? null)
    } catch { } finally { setLoading(false) }
  }, [page, dSearch, status, invoiceType, startDate, endDate])

  useEffect(() => { load() }, [load])

  const totalShown = invoices.reduce((s, i) => s + i.total, 0)

  return (
    <div className="space-y-4">
      <div className="card">
        {/* Filters */}
        <div className="p-4 border-b border-gray-100 flex flex-wrap gap-2">
          <SearchBar value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="ស្វែងរកអតិថិជន..." />
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }} className="input-field text-sm py-2 w-36">
            <option value="">ស្ថានភាពទាំងអស់</option>
            <option value="paid">បានបង់</option>
            <option value="pending">រង់ចាំ</option>
            <option value="cancelled">បោះបង់</option>
          </select>
          <select value={invoiceType} onChange={e => { setInvoiceType(e.target.value); setPage(1) }} className="input-field text-sm py-2 w-32">
            <option value="">ប្រភេទទាំងអស់</option>
            <option value="customer">អតិថិជន</option>
            <option value="partner">ដៃគូ</option>
          </select>
          <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1) }} className="input-field text-sm py-2 w-38" />
          <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1) }} className="input-field text-sm py-2 w-38" />
          <div className="flex-1" />
          <Link to="/invoices/create" className="btn-primary whitespace-nowrap">+ វិក្កយបត្រថ្មី</Link>
        </div>

        {/* Summary bar */}
        {invoices.length > 0 && (
          <div className="px-4 py-2 bg-green-50 border-b border-green-100 flex items-center gap-4 text-sm">
            <span className="text-green-700">សរុបបង្ហាញ:</span>
            <span className="font-semibold text-green-800">{formatCurrency(totalShown)}</span>
            <span className="text-green-600">({invoices.length} វិក្កយបត្រ)</span>
          </div>
        )}

        {loading ? <PageLoader /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header text-left">លេខវិក្កយបត្រ</th>
                    <th className="table-header text-left">អតិថិជន / ដៃគូ</th>
                    <th className="table-header text-left">ប្រភេទ</th>
                    <th className="table-header text-right">ទំនិញ</th>
                    <th className="table-header text-right">សរុប</th>
                    <th className="table-header text-center">ស្ថានភាព</th>
                    <th className="table-header text-left">កាលបរិច្ឆេទ</th>
                    <th className="table-header text-center">សកម្មភាព</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.length === 0 && (
                    <tr><td colSpan={8}><EmptyState icon="🧾" title="គ្មានវិក្កយបត្រ" message="ចុច '+ វិក្កយបត្រថ្មី' ដើម្បីបង្កើត" /></td></tr>
                  )}
                  {invoices.map(inv => {
                    const st = INVOICE_STATUS[inv.status] || INVOICE_STATUS.pending
                    const tp = INVOICE_TYPE[inv.invoiceType] || INVOICE_TYPE.customer
                    return (
                      <tr key={inv._id} className="hover:bg-gray-50 transition-colors">
                        <td className="table-cell font-mono text-xs text-primary-700 font-semibold">{inv.invoiceNumber}</td>
                        <td className="table-cell">
                          <p className="font-medium text-gray-800">{inv.partnerName || inv.customerName}</p>
                          {inv.customerPhone && <p className="text-xs text-gray-400">{inv.customerPhone}</p>}
                        </td>
                        <td className="table-cell"><span className={tp.cls}>{tp.label}</span></td>
                        <td className="table-cell text-right text-gray-500">{inv.items?.length || '—'}</td>
                        <td className="table-cell text-right font-semibold text-green-700">{formatCurrency(inv.total)}</td>
                        <td className="table-cell text-center"><span className={st.cls}>{st.label}</span></td>
                        <td className="table-cell text-xs text-gray-500">{formatDateTime(inv.createdAt)}</td>
                        <td className="table-cell text-center">
                          <Link to={`/invoices/${inv._id}`} className="p-1.5 text-primary-600 hover:bg-primary-50 rounded-lg inline-flex text-sm transition-colors">
                            👁️ មើល
                          </Link>
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