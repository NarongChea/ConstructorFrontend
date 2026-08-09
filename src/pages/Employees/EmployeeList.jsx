import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { employeeAPI, debtAPI } from '../../api/index.js'
import { useDebounce } from '../../hooks/useDebounce.js'
import Pagination from '../../components/UI/Pagination.jsx'
import Modal from '../../components/UI/Modal.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import { EmptyState, PageLoader, SearchBar, FormField } from '../../components/UI/index.jsx'

const EMPTY = { name: '', phone: '', role: '', baseSalary: 0, hireDate: '', note: '' }

const formatDate = (d) => d ? new Date(d).toLocaleDateString('km-KH') : '—'
const formatCurrency = (n) => (n || 0).toLocaleString('km-KH') + ' ៛'

const calcWorkDays = (hireDate) => {
  if (!hireDate) return 0
  const diff = Math.floor((new Date() - new Date(hireDate)) / (1000 * 60 * 60 * 24))
  return Math.max(0, diff)
}
const calcEarned = (salary, days) => Math.round(((salary || 0) / 30) * days)

const statusColor = (s) => ({
  settled: 'text-green-600 bg-green-50 px-2 py-0.5 rounded-full text-xs font-semibold',
  partial: 'text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full text-xs font-semibold',
}[s] ?? 'text-red-600 bg-red-50 px-2 py-0.5 rounded-full text-xs font-semibold')

const statusLabel = (s) => ({
  settled: 'បានទូទាត់', partial: 'ទូទាត់មួយភាគ',
}[s] ?? 'មិនទាន់ទូទាត់')

export default function EmployeeList() {
  const [employees, setEmployees]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [page, setPage]               = useState(1)
  const [pagination, setPagination]   = useState(null)
  const [showModal, setShowModal]     = useState(false)
  const [editing, setEditing]         = useState(null)
  const [form, setForm]               = useState(EMPTY)
  const [saving, setSaving]           = useState(false)
  const [delConfirm, setDelConfirm]   = useState(null)

  // detail modal
  const [detail, setDetail]           = useState(null)   // { emp, debts[] }
  const [detailLoading, setDetailLoading] = useState(false)

  const dSearch = useDebounce(search, 400)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await employeeAPI.list({ page, limit: 20, search: dSearch || undefined })
      setEmployees(Array.isArray(res.data) ? res.data : [])
      setPagination(null)
    } catch { } finally { setLoading(false) }
  }, [page, dSearch])

  useEffect(() => { load() }, [load])

  // ── Click employee row → load their debts ──
  const openDetail = async (emp) => {
    setDetail({ emp, debts: [] })
    setDetailLoading(true)
    try {
      const res = await debtAPI.list({ type: 'employee_borrow', limit: 100 })
      const all = res.data?.debts ?? []
      const mine = all.filter(d =>
        (d.entityId?._id || d.entityId) === emp._id || d.entityName === emp.name
      )
      setDetail({ emp, debts: mine })
    } catch { } finally { setDetailLoading(false) }
  }

  const openEdit = (e) => {
    setEditing(e)
    setForm(e
      ? {
          name:       e.name,
          phone:      e.phone      || '',
          role:       e.role       || '',
          baseSalary: e.baseSalary || 0,
          hireDate:   e.hireDate ? e.hireDate.split('T')[0] : '',
          note:       e.note       || '',
        }
      : EMPTY)
    setShowModal(true)
  }

  const save = async () => {
    if (!form.name) { toast.error('សូមបំពេញឈ្មោះ'); return }
    if (!form.role) { toast.error('សូមបំពេញតួនាទី'); return }
    setSaving(true)
    try {
      const payload = { ...form, baseSalary: Number(form.baseSalary), hireDate: form.hireDate || undefined }
      if (editing) { await employeeAPI.update(editing._id, payload); toast.success('កែប្រែដោយជោគជ័យ') }
      else         { await employeeAPI.create(payload);               toast.success('បន្ថែមដោយជោគជ័យ') }
      setShowModal(false); load()
    } catch { } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    await employeeAPI.delete(delConfirm._id)
    toast.success('លុបដោយជោគជ័យ')
    setDelConfirm(null); load()
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="p-4 border-b border-gray-100 flex flex-wrap gap-2">
          <SearchBar value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="ស្វែងរកបុគ្គលិក..." />
          <div className="flex-1" />
          <button onClick={() => openEdit(null)} className="btn-primary">+ បុគ្គលិកថ្មី</button>
        </div>

        {loading ? <PageLoader /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header text-left">ឈ្មោះ</th>
                    <th className="table-header text-left">តួនាទី</th>
                    <th className="table-header text-left">ទូរស័ព្ទ</th>
                    <th className="table-header text-left">ថ្ងៃចូលធ្វើការ</th>
                    <th className="table-header text-right">ប្រាក់ខែ</th>
                    <th className="table-header text-center">សកម្មភាព</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.length === 0 && (
                    <tr><td colSpan={6}>
                      <EmptyState icon="👥" title="គ្មានបុគ្គលិក" message="ចុច '+ បុគ្គលិកថ្មី' ដើម្បីបន្ថែម" />
                    </td></tr>
                  )}
                  {employees.map(e => (
                    <tr key={e._id}
                      onClick={() => openDetail(e)}
                      className="hover:bg-indigo-50 cursor-pointer transition-colors">
                      <td className="table-cell font-semibold text-gray-800">
                        {e.name}
                        <span className="ml-1 text-xs text-indigo-300">↗</span>
                      </td>
                      <td className="table-cell text-gray-500">{e.role || '—'}</td>
                      <td className="table-cell text-sm">{e.phone || '—'}</td>
                      <td className="table-cell text-sm text-gray-500">
                        {e.hireDate ? formatDate(e.hireDate) : '—'}
                      </td>
                      <td className="table-cell text-right font-medium">
                        {e.baseSalary ? e.baseSalary.toLocaleString() + ' ៛' : '—'}
                      </td>
                      <td className="table-cell text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={ev => { ev.stopPropagation(); openEdit(e) }}
                            className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg">✏️</button>
                          <button
                            onClick={ev => { ev.stopPropagation(); setDelConfirm(e) }}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pagination={pagination} onChange={setPage} />
          </>
        )}
      </div>

      {/* ══════════════════════════════════════
          Employee Detail Modal
      ══════════════════════════════════════ */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="ព័ត៌មានបុគ្គលិក" size="lg">
        {detail && (() => {
          const { emp, debts } = detail
          const workDays    = calcWorkDays(emp.hireDate)
          const dailyRate   = Math.round((emp.baseSalary || 0) / 30)
          const earned      = calcEarned(emp.baseSalary, workDays)
          const totalBorrow = debts.reduce((s, d) => s + (d.remainingAmount || 0), 0)
          const net         = earned - totalBorrow   // + = owner owes worker, − = worker owes owner

          return (
            <div className="space-y-4">
              {detailLoading && (
                <p className="text-center text-sm text-gray-400 py-2">កំពុងផ្ទុក...</p>
              )}

              {/* ── Info header ── */}
              <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-4">
                <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-lg flex-shrink-0">
                  {emp.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 text-base">{emp.name}</p>
                  <p className="text-sm text-gray-500">
                    {emp.role || '—'}
                    {emp.phone && <span> · 📞 {emp.phone}</span>}
                  </p>
                  {emp.hireDate && (
                    <p className="text-xs text-gray-400 mt-0.5">ចូលធ្វើការ: {formatDate(emp.hireDate)}</p>
                  )}
                </div>
              </div>

              {/* ── Stats grid ── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-blue-500 mb-1">ប្រាក់ខែ</p>
                  <p className="font-bold text-blue-700">{formatCurrency(emp.baseSalary)}</p>
                </div>
                <div className="bg-indigo-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-indigo-500 mb-1">ប្រាក់/ថ្ងៃ</p>
                  <p className="font-bold text-indigo-700">{formatCurrency(dailyRate)}</p>
                </div>
                <div className="bg-gray-100 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">ថ្ងៃធ្វើការ</p>
                  <p className="font-bold text-gray-700">{workDays} ថ្ងៃ</p>
                </div>
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-green-500 mb-1">បានរក</p>
                  <p className="font-bold text-green-700">{formatCurrency(earned)}</p>
                </div>
              </div>

              {/* ── Net result — big banner ── */}
              <div className={`rounded-xl p-4 text-center ${net >= 0 ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
                {net >= 0 ? (
                  <>
                    <p className="text-sm text-green-600 mb-1">💚 ប្រាក់ខែលើស — ម្ចាស់ជំពាក់បុគ្គលិក</p>
                    <p className="text-3xl font-bold text-green-700">+{formatCurrency(net)}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-red-500 mb-1">🔴 ខ្ចីលើស — បុគ្គលិកនៅជំពាក់</p>
                    <p className="text-3xl font-bold text-red-600">−{formatCurrency(Math.abs(net))}</p>
                  </>
                )}
                <p className="text-xs text-gray-400 mt-2">
                  បានរក {formatCurrency(earned)} − ខ្ចី {formatCurrency(totalBorrow)}
                </p>
              </div>

              {/* ── Borrow history ── */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  ប្រវត្តិខ្ចី ({debts.length})
                </p>
                {debts.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-6">មិនមានការខ្ចី</p>
                ) : (
                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="table-header text-left">កាលបរិច្ឆេទ</th>
                          <th className="table-header text-right">ចំនួនខ្ចី</th>
                          <th className="table-header text-right">នៅជំពាក់</th>
                          <th className="table-header text-center">ស្ថានភាព</th>
                          <th className="table-header text-left">ចំណាំ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {debts.map(d => (
                          <tr key={d._id} className="hover:bg-gray-50">
                            <td className="table-cell text-gray-500 text-xs">{formatDate(d.createdAt)}</td>
                            <td className="table-cell text-right font-semibold text-gray-700">{formatCurrency(d.totalAmount)}</td>
                            <td className="table-cell text-right font-semibold text-red-600">{formatCurrency(d.remainingAmount)}</td>
                            <td className="table-cell text-center">
                              <span className={statusColor(d.status)}>{statusLabel(d.status)}</span>
                            </td>
                            <td className="table-cell text-xs text-gray-400">{d.note || '—'}</td>
                          </tr>
                        ))}
                        <tr className="bg-gray-50 font-semibold text-sm">
                          <td className="table-cell text-gray-600">សរុប</td>
                          <td className="table-cell text-right text-gray-800">
                            {formatCurrency(debts.reduce((s, d) => s + d.totalAmount, 0))}
                          </td>
                          <td className="table-cell text-right text-red-600">
                            {formatCurrency(totalBorrow)}
                          </td>
                          <td colSpan={2} />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2 border-t">
                <button onClick={() => setDetail(null)} className="btn-secondary">បិទ</button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* ── Add / Edit Modal ── */}
      <Modal open={showModal} onClose={() => setShowModal(false)}
        title={editing ? 'កែប្រែបុគ្គលិក' : 'បុគ្គលិកថ្មី'} size="md">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="ឈ្មោះ" required className="col-span-2">
              <input className="input-field" value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="ឈ្មោះបុគ្គលិក" />
            </FormField>
            <FormField label="តួនាទី" required>
              <input className="input-field" value={form.role}
                onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                placeholder="ឧ. អ្នកលក់, ជាង..." />
            </FormField>
            <FormField label="ទូរស័ព្ទ">
              <input className="input-field" value={form.phone}
                onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                placeholder="0xx xxx xxx" />
            </FormField>
            <FormField label="ប្រាក់ខែ (៛)" className="col-span-2">
              <input type="number" className="input-field" value={form.baseSalary} min="0"
                onChange={e => setForm(p => ({ ...p, baseSalary: Number(e.target.value) }))} />
            </FormField>
            <FormField label="ថ្ងៃចាប់ផ្តើមធ្វើការ" className="col-span-2">
              <input type="date" className="input-field" value={form.hireDate}
                onChange={e => setForm(p => ({ ...p, hireDate: e.target.value }))} />
            </FormField>
            <FormField label="ចំណាំ" className="col-span-2">
              <textarea className="input-field" rows={2} value={form.note}
                onChange={e => setForm(p => ({ ...p, note: e.target.value }))} />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <button onClick={() => setShowModal(false)} className="btn-secondary">បោះបង់</button>
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? 'កំពុង...' : 'រក្សាទុក'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!delConfirm} onClose={() => setDelConfirm(null)} onConfirm={handleDelete}
        title="លុបបុគ្គលិក" message={`លុប "${delConfirm?.name}"?`} />
    </div>
  )
}