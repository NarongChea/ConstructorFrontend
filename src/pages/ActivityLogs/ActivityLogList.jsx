import { useEffect, useState, useCallback } from 'react'
import { activityLogAPI } from '../../api/index.js'
import { formatDateTime } from '../../utils/formatters.js'
import { useDebounce } from '../../hooks/useDebounce.js'
import Pagination from '../../components/UI/Pagination.jsx'
import Modal from '../../components/UI/Modal.jsx'
import { EmptyState, PageLoader } from '../../components/UI/index.jsx'

const ACTION_LABEL = {
  CREATE: { label: 'បង្កើត',  cls: 'text-green-600 bg-green-50 px-2 py-0.5 rounded-full text-xs font-semibold' },
  UPDATE: { label: 'កែប្រែ',  cls: 'text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full text-xs font-semibold' },
  DELETE: { label: 'លុប',     cls: 'text-red-600 bg-red-50 px-2 py-0.5 rounded-full text-xs font-semibold' },
}

const RESOURCE_LABEL = {
  invoice:  'វិក្កយបត្រ',
  employee: 'បុគ្គលិក',
  debt:     'បំណុល',
  product:  'ផលិតផល',
  variant:  'Variant',
}

// Fields we don't want to show in the diff — noise, not signal.
const HIDDEN_FIELDS = new Set(['__v', '_id', 'createdAt', 'updatedAt', 'items'])

const formatValue = (v) => {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'បាទ/ចាស' : 'ទេ'
  if (typeof v === 'number') return v.toLocaleString('km-KH')
  if (typeof v === 'object') {
    // ObjectId-like or populated ref — show its string form
    if (v.name) return v.name
    return JSON.stringify(v)
  }
  return String(v)
}

// Build a list of { field, before, after } for every field that actually changed
function diffSnapshots(before, after) {
  if (!before || !after) return []
  const fields = new Set([...Object.keys(before), ...Object.keys(after)])
  const rows = []
  for (const field of fields) {
    if (HIDDEN_FIELDS.has(field)) continue
    const b = before[field]
    const a = after[field]
    const bStr = JSON.stringify(b)
    const aStr = JSON.stringify(a)
    if (bStr !== aStr) rows.push({ field, before: b, after: a })
  }
  return rows
}

export default function ActivityLogList() {
  const [logs,       setLogs]       = useState([])
  const [pagination, setPagination] = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [page,       setPage]       = useState(1)

  const [resource, setResource] = useState('')
  const [action,   setAction]   = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate,   setEndDate]   = useState('')

  const [detail, setDetail] = useState(null)   // selected log entry, shown in modal

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await activityLogAPI.list({
        page, limit: 30,
        resource: resource || undefined,
        action:   action   || undefined,
        startDate: startDate || undefined,
        endDate:   endDate   || undefined,
      })
      setLogs(res.data?.logs ?? [])
      setPagination(res.data?.pagination ?? null)
    } catch { } finally { setLoading(false) }
  }, [page, resource, action, startDate, endDate])

  useEffect(() => { load() }, [load])

  const openDetail = (log) => setDetail(log)

  const diffRows = detail ? diffSnapshots(detail.before, detail.after) : []

  return (
    <div className="space-y-4">
      <div className="card">
        {/* Filters */}
        <div className="p-4 border-b border-gray-100 flex flex-wrap gap-2 items-center">
          <h2 className="font-semibold text-gray-800">📜 កំណត់ហេតុសកម្មភាព</h2>

          <select value={resource} onChange={e => { setResource(e.target.value); setPage(1) }}
            className="input-field w-auto text-sm">
            <option value="">ប្រភេទទាំងអស់</option>
            <option value="invoice">វិក្កយបត្រ</option>
            <option value="employee">បុគ្គលិក</option>
            <option value="debt">បំណុល</option>
            <option value="product">ផលិតផល</option>
            <option value="variant">Variant</option>
          </select>

          <select value={action} onChange={e => { setAction(e.target.value); setPage(1) }}
            className="input-field w-auto text-sm">
            <option value="">សកម្មភាពទាំងអស់</option>
            <option value="CREATE">បង្កើត</option>
            <option value="UPDATE">កែប្រែ</option>
            <option value="DELETE">លុប</option>
          </select>

          <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1) }}
            className="input-field text-sm w-38" />
          <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1) }}
            className="input-field text-sm w-38" />
        </div>

        {loading ? <PageLoader /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header text-left">ពេលវេលា</th>
                    <th className="table-header text-left">អ្នកប្រើ</th>
                    <th className="table-header text-center">សកម្មភាព</th>
                    <th className="table-header text-left">ប្រភេទ</th>
                    <th className="table-header text-left">លម្អិត</th>
                    <th className="table-header text-center">សកម្មភាព</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 && (
                    <tr><td colSpan={6}>
                      <EmptyState icon="📜" title="គ្មានកំណត់ហេតុ" message="សកម្មភាពទាំងអស់នឹងបង្ហាញនៅទីនេះ" />
                    </td></tr>
                  )}
                  {logs.map(log => {
                    const a = ACTION_LABEL[log.action] || { label: log.action, cls: 'badge-gray' }
                    const hasSnapshots = log.before || log.after
                    return (
                      <tr key={log._id} className="hover:bg-gray-50">
                        <td className="table-cell text-xs text-gray-500">{formatDateTime(log.createdAt)}</td>
                        <td className="table-cell font-medium text-gray-800">{log.userName || log.userId?.name || '—'}</td>
                        <td className="table-cell text-center"><span className={a.cls}>{a.label}</span></td>
                        <td className="table-cell text-gray-600">{RESOURCE_LABEL[log.resource] || log.resource}</td>
                        <td className="table-cell text-xs text-gray-400 font-mono">{log.resourceId || '—'}</td>
                        <td className="table-cell text-center">
                          {hasSnapshots ? (
                            <button onClick={() => openDetail(log)}
                              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium border border-indigo-200 rounded-lg px-3 py-1 bg-indigo-50">
                              👁️ មើលលម្អិត
                            </button>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
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

      {/* ── Detail / diff modal ── */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="លម្អិតការផ្លាស់ប្តូរ" size="lg">
        {detail && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <p>អ្នកប្រើ: <span className="font-semibold">{detail.userName || detail.userId?.name || '—'}</span></p>
              <p>សកម្មភាព: <span className={ACTION_LABEL[detail.action]?.cls}>{ACTION_LABEL[detail.action]?.label || detail.action}</span></p>
              <p>ប្រភេទ: <span className="font-semibold">{RESOURCE_LABEL[detail.resource] || detail.resource}</span></p>
              <p>ពេលវេលា: <span className="font-semibold">{formatDateTime(detail.createdAt)}</span></p>
            </div>

            {detail.action === 'DELETE' && detail.before && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  ស្ថានភាពមុនលុប
                </p>
                <div className="rounded-xl border border-red-100 bg-red-50 overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody>
                      {Object.entries(detail.before)
                        .filter(([k]) => !HIDDEN_FIELDS.has(k))
                        .map(([k, v]) => (
                          <tr key={k} className="border-b border-red-100 last:border-0">
                            <td className="px-3 py-2 font-medium text-gray-600 w-1/3">{k}</td>
                            <td className="px-3 py-2 text-red-700">{formatValue(v)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {detail.action !== 'DELETE' && diffRows.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  អ្វីដែលបានផ្លាស់ប្តូរ ({diffRows.length})
                </p>
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="table-header text-left">ចំណែក</th>
                        <th className="table-header text-left">មុន</th>
                        <th className="table-header text-left">ក្រោយ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diffRows.map(({ field, before, after }) => (
                        <tr key={field} className="hover:bg-gray-50">
                          <td className="table-cell font-medium text-gray-700">{field}</td>
                          <td className="table-cell text-red-500">{formatValue(before)}</td>
                          <td className="table-cell text-green-600 font-semibold">{formatValue(after)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {detail.action === 'CREATE' && detail.after && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  ទិន្នន័យដែលបានបង្កើត
                </p>
                <div className="rounded-xl border border-green-100 bg-green-50 overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody>
                      {Object.entries(detail.after)
                        .filter(([k]) => !HIDDEN_FIELDS.has(k))
                        .map(([k, v]) => (
                          <tr key={k} className="border-b border-green-100 last:border-0">
                            <td className="px-3 py-2 font-medium text-gray-600 w-1/3">{k}</td>
                            <td className="px-3 py-2 text-green-700">{formatValue(v)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {detail.action !== 'DELETE' && detail.action !== 'CREATE' && diffRows.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-4">មិនមានការផ្លាស់ប្តូរលើ field សំខាន់ៗ</p>
            )}

            <div className="flex justify-end pt-2 border-t">
              <button onClick={() => setDetail(null)} className="btn-secondary">បិទ</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}