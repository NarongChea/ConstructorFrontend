import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { debtAPI, employeeAPI } from '../../api/index.js'
import { formatCurrency, formatDate } from '../../utils/formatters.js'
import Pagination from '../../components/UI/Pagination.jsx'
import Modal from '../../components/UI/Modal.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import { EmptyState, PageLoader, FormField } from '../../components/UI/index.jsx'

const defaultDueDate = () => {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().split('T')[0]
}

const EMPTY = () => ({
  type: 'employee_borrow',
  entityId: '',
  entityName: '',
  entityPhone: '',
  totalAmount: '',
  dueDate: defaultDueDate(),
  note: '',
})

const TYPE_LABEL = {
  employee_borrow: 'បុគ្គលិកខ្ចី',
  customer_credit: 'អតិថិជនជំពាក់',
}

const calcWorkDays = (hireDate) => {
  if (!hireDate) return 0
  const diff = Math.floor((new Date() - new Date(hireDate)) / (1000 * 60 * 60 * 24))
  return Math.max(0, diff)
}
const calcEarned = (salary, days) => Math.round(((salary || 0) / 30) * days)

export default function DebtList() {
  const [debts, setDebts]               = useState([])
  const [pagination, setPagination]     = useState(null)
  const [loading, setLoading]           = useState(true)
  const [employees, setEmployees]       = useState([])
  const [page, setPage]                 = useState(1)
  const [showModal, setShowModal]       = useState(false)
  const [editing, setEditing]           = useState(null)
  const [showPay, setShowPay]           = useState(null)
  const [payAmount, setPayAmount]       = useState('')
  const [form, setForm]                 = useState(EMPTY())
  const [saving, setSaving]             = useState(false)
  const [delConfirm, setDelConfirm]     = useState(null)
  const [filterType, setFilterType]     = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterEmployee, setFilterEmployee] = useState('')   // ← employee filter

  // work days override
  const [showWorkDays, setShowWorkDays]   = useState(null)
  const [workDaysInput, setWorkDaysInput] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await debtAPI.list({
        page, limit: 20,
        type:   filterType     || undefined,
        status: filterStatus   || undefined,
        search: filterEmployee || undefined,   // filter by name
      })
      setDebts(res.data?.debts ?? [])
      setPagination(res.data?.pagination ?? null)
    } catch { } finally { setLoading(false) }
  }, [page, filterType, filterStatus, filterEmployee])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    employeeAPI.list({ limit: 100 })
      .then(r => setEmployees(Array.isArray(r.data) ? r.data : []))
  }, [])

  const getEmployee = (debt) => {
    if (debt.type !== 'employee_borrow') return null
    return employees.find(
      e => e._id === (debt.entityId?._id || debt.entityId) || e.name === debt.entityName
    ) || null
  }

  const handleEmployeeSelect = (e) => {
    const emp = employees.find(em => em._id === e.target.value)
    if (emp) setForm(p => ({ ...p, entityId: emp._id, entityName: emp.name, entityPhone: emp.phone || '' }))
    else     setForm(p => ({ ...p, entityId: '', entityName: '', entityPhone: '' }))
  }

  const openAdd  = () => { setEditing(null); setForm(EMPTY()); setShowModal(true) }
  const openEdit = (d, ev) => {
    ev.stopPropagation()
    setEditing(d)
    setForm({
      type:        d.type,
      entityId:    d.entityId || '',
      entityName:  d.entityName,
      entityPhone: d.entityPhone || '',
      totalAmount: d.totalAmount,
      dueDate:     d.dueDate ? d.dueDate.split('T')[0] : '',
      note:        d.note || '',
    })
    setShowModal(true)
  }

  const save = async () => {
    if (!form.entityName)                            { toast.error('សូមបំពេញឈ្មោះ'); return }
    if (!form.totalAmount || +form.totalAmount <= 0) { toast.error('សូមបំពេញចំនួនទឹកប្រាក់'); return }
    setSaving(true)
    try {
      const payload = {
        type:        form.type,
        entityId:    form.entityId || undefined,
        entityName:  form.entityName,
        entityPhone: form.entityPhone,
        totalAmount: Number(form.totalAmount),
        dueDate:     form.dueDate || undefined,
        note:        form.note,
      }
      if (editing) { await debtAPI.update(editing._id, payload); toast.success('កែប្រែដោយជោគជ័យ') }
      else         { await debtAPI.create(payload);               toast.success('បន្ថែមបំណុលដោយជោគជ័យ') }
      setShowModal(false); load()
    } catch { } finally { setSaving(false) }
  }

  const handlePay = async () => {
    if (!payAmount || +payAmount <= 0) { toast.error('សូមបំពេញចំនួន'); return }
    setSaving(true)
    try {
      await debtAPI.pay(showPay._id, { amount: Number(payAmount) })
      toast.success('បានកត់ត្រាការទូទាត់')
      setShowPay(null); setPayAmount(''); load()
    } catch { } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    await debtAPI.delete(delConfirm._id)
    toast.success('លុបដោយជោគជ័យ')
    setDelConfirm(null); load()
  }

  const handleSaveWorkDays = async () => {
    const val = parseInt(workDaysInput)
    if (isNaN(val) || val < 0) { toast.error('សូមបញ្ចូលចំនួនថ្ងៃ'); return }
    try {
      await debtAPI.update(showWorkDays._id, { workDaysOverride: val })
      toast.success('កំណត់ថ្ងៃធ្វើការដោយជោគជ័យ')
      setShowWorkDays(null); load()
    } catch { toast.error('មានបញ្ហា') }
  }

  const statusColor = (s) => ({
    settled: 'text-green-600 bg-green-50 px-2 py-0.5 rounded-full text-xs font-semibold',
    partial: 'text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full text-xs font-semibold',
  }[s] ?? 'text-red-600 bg-red-50 px-2 py-0.5 rounded-full text-xs font-semibold')

  const statusLabel = (s) => ({
    settled: 'បានទូទាត់', partial: 'ទូទាត់មួយភាគ',
  }[s] ?? 'មិនទាន់ទូទាត់')

  return (
    <div className="space-y-4">
      <div className="card">
        {/* ── Filter bar ── */}
        <div className="p-4 border-b border-gray-100 flex flex-wrap gap-2 items-center">
          <h2 className="font-semibold text-gray-800">បំណុល</h2>

          {/* Employee name filter */}
          <select className="input-field w-auto text-sm" value={filterEmployee}
            onChange={e => { setFilterEmployee(e.target.value); setPage(1) }}>
            <option value="">👤 បុគ្គលិកទាំងអស់</option>
            {employees.map(e => (
              <option key={e._id} value={e.name}>{e.name}</option>
            ))}
          </select>

          <select className="input-field w-auto text-sm" value={filterType}
            onChange={e => { setFilterType(e.target.value); setPage(1) }}>
            <option value="">ប្រភេទទាំងអស់</option>
            <option value="employee_borrow">បុគ្គលិកខ្ចី</option>
            <option value="customer_credit">អតិថិជនជំពាក់</option>
          </select>

          <select className="input-field w-auto text-sm" value={filterStatus}
            onChange={e => { setFilterStatus(e.target.value); setPage(1) }}>
            <option value="">ស្ថានភាពទាំងអស់</option>
            <option value="pending">មិនទាន់ទូទាត់</option>
            <option value="partial">ទូទាត់មួយភាគ</option>
            <option value="settled">បានទូទាត់</option>
          </select>

          <div className="flex-1" />
          <button onClick={openAdd} className="btn-primary">+ បំណុលថ្មី</button>
        </div>

        {loading ? <PageLoader /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header text-left">ឈ្មោះ</th>
                    <th className="table-header text-left">ប្រភេទ</th>
                    <th className="table-header text-right">ប្រាក់ខែ</th>
                    <th className="table-header text-center">ថ្ងៃធ្វើការ</th>
                    <th className="table-header text-right">បានរក</th>
                    <th className="table-header text-right">ខ្ចីសរុប</th>
                    <th className="table-header text-right">សមតុល្យ</th>
                    <th className="table-header text-center">ស្ថានភាព</th>
                    <th className="table-header text-left">កាលកំណត់</th>
                    <th className="table-header text-center">សកម្មភាព</th>
                  </tr>
                </thead>
                <tbody>
                  {debts.length === 0 && (
                    <tr><td colSpan={10}>
                      <EmptyState icon="💰" title="គ្មានបំណុល" message="ចុច '+ បំណុលថ្មី' ដើម្បីបន្ថែម" />
                    </td></tr>
                  )}
                  {debts.map(d => {
                    const emp      = getEmployee(d)
                    const salary   = emp?.baseSalary ?? 0
                    const workDays = d.workDaysOverride != null
                                     ? d.workDaysOverride
                                     : calcWorkDays(emp?.hireDate)
                    const earned   = calcEarned(salary, workDays)
                    const net      = earned - d.remainingAmount
                    const isEmp    = d.type === 'employee_borrow'

                    return (
                      <tr key={d._id} className="hover:bg-gray-50">
                        <td className="table-cell font-medium text-gray-800">
                          {d.entityName}
                          {emp?.hireDate && (
                            <div className="text-xs text-gray-400">ចូល: {formatDate(emp.hireDate)}</div>
                          )}
                        </td>
                        <td className="table-cell text-gray-500">{TYPE_LABEL[d.type] || d.type}</td>

                        <td className="table-cell text-right text-blue-600 font-medium">
                          {isEmp && salary ? formatCurrency(salary) : '—'}
                        </td>

                        <td className="table-cell text-center">
                          {isEmp ? (
                            <button
                              onClick={() => { setShowWorkDays(d); setWorkDaysInput(String(workDays)) }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100">
                              {workDays} ថ្ងៃ
                              {d.workDaysOverride != null && <span className="text-indigo-300">✎</span>}
                            </button>
                          ) : '—'}
                        </td>

                        <td className="table-cell text-right text-green-600 font-semibold">
                          {isEmp ? formatCurrency(earned) : '—'}
                        </td>

                        <td className="table-cell text-right font-semibold text-gray-700">
                          {formatCurrency(d.totalAmount)}
                        </td>

                        {/* net balance */}
                        <td className="table-cell text-right font-bold">
                          {isEmp ? (
                            net >= 0
                              ? <span className="text-green-600">+{formatCurrency(net)}</span>
                              : <span className="text-red-600">−{formatCurrency(Math.abs(net))}</span>
                          ) : (
                            <span className="text-red-600">{formatCurrency(d.remainingAmount)}</span>
                          )}
                        </td>

                        <td className="table-cell text-center">
                          <span className={statusColor(d.status)}>{statusLabel(d.status)}</span>
                        </td>
                        <td className="table-cell text-xs text-gray-400">
                          {d.dueDate ? formatDate(d.dueDate) : '—'}
                        </td>
                        <td className="table-cell text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={ev => openEdit(d, ev)}
                              className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg">✏️</button>
                            {d.status !== 'settled' && (
                              <button onClick={() => { setShowPay(d); setPayAmount('') }}
                                className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg">💵</button>
                            )}
                            <button onClick={() => setDelConfirm(d)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg">🗑️</button>
                          </div>
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

      {/* ── Add / Edit Modal ── */}
      <Modal open={showModal} onClose={() => setShowModal(false)}
        title={editing ? 'កែប្រែបំណុល' : 'បំណុលថ្មី'} size="md">
        <div className="space-y-3">
          <FormField label="ប្រភេទ" required>
            <select className="input-field" value={form.type} disabled={!!editing}
              onChange={e => setForm(p => ({ ...p, type: e.target.value, entityId: '', entityName: '', entityPhone: '' }))}>
              <option value="employee_borrow">បុគ្គលិកខ្ចី</option>
              <option value="customer_credit">អតិថិជនជំពាក់</option>
            </select>
          </FormField>

          {form.type === 'employee_borrow' ? (
            <FormField label="ជ្រើសបុគ្គលិក" required>
              <select className="input-field" value={form.entityId}
                onChange={handleEmployeeSelect} disabled={!!editing}>
                <option value="">— ជ្រើសបុគ្គលិក —</option>
                {employees.map(e => (
                  <option key={e._id} value={e._id}>
                    {e.name} {e.phone ? `(${e.phone})` : ''} — {e.baseSalary?.toLocaleString()}៛/ខែ
                  </option>
                ))}
              </select>
            </FormField>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <FormField label="ឈ្មោះអតិថិជន" required>
                <input className="input-field" value={form.entityName}
                  onChange={e => setForm(p => ({ ...p, entityName: e.target.value }))} placeholder="ឈ្មោះ" />
              </FormField>
              <FormField label="ទូរស័ព្ទ">
                <input className="input-field" value={form.entityPhone}
                  onChange={e => setForm(p => ({ ...p, entityPhone: e.target.value }))} placeholder="0xx xxx xxx" />
              </FormField>
            </div>
          )}

          {/* Employee preview */}
          {form.type === 'employee_borrow' && form.entityId && (() => {
            const emp    = employees.find(e => e._id === form.entityId)
            if (!emp) return null
            const days   = calcWorkDays(emp.hireDate)
            const earned = calcEarned(emp.baseSalary, days)
            return (
              <div className="bg-indigo-50 rounded-lg px-3 py-2 text-sm space-y-1">
                <p>👤 <span className="font-semibold">{emp.name}</span>
                  {emp.phone && <span className="text-gray-500"> · 📞 {emp.phone}</span>}
                </p>
                <p>
                  💰 {formatCurrency(emp.baseSalary)}/ខែ &nbsp;·&nbsp;
                  📅 {days} ថ្ងៃ &nbsp;·&nbsp;
                  ✅ បានរក <span className="font-semibold text-green-700">{formatCurrency(earned)}</span>
                </p>
              </div>
            )
          })()}

          <div className="grid grid-cols-2 gap-3">
            <FormField label="ចំនួនខ្ចី (៛)" required>
              <input type="number" className="input-field" value={form.totalAmount} min="0"
                onChange={e => setForm(p => ({ ...p, totalAmount: e.target.value }))} />
            </FormField>
            <FormField label="កាលកំណត់ (default 30 ថ្ងៃ)">
              <input type="date" className="input-field" value={form.dueDate}
                onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} />
            </FormField>
          </div>

          <FormField label="ចំណាំ">
            <textarea className="input-field" rows={2} value={form.note}
              onChange={e => setForm(p => ({ ...p, note: e.target.value }))} />
          </FormField>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button onClick={() => setShowModal(false)} className="btn-secondary">បោះបង់</button>
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? 'កំពុង...' : 'រក្សាទុក'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Set Work Days Modal ── */}
      <Modal open={!!showWorkDays} onClose={() => setShowWorkDays(null)}
        title="កំណត់ថ្ងៃធ្វើការ" size="sm">
        {showWorkDays && (() => {
          const emp    = getEmployee(showWorkDays)
          const salary = emp?.baseSalary ?? 0
          const days   = parseInt(workDaysInput) || 0
          const earned = calcEarned(salary, days)
          const net    = earned - showWorkDays.remainingAmount
          return (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                <p>👤 <span className="font-semibold">{showWorkDays.entityName}</span></p>
                <p>💰 ប្រាក់/ថ្ងៃ: <span className="font-semibold">{formatCurrency(Math.round(salary / 30))}</span></p>
              </div>
              <FormField label="ចំនួនថ្ងៃធ្វើការ" required>
                <input type="number" className="input-field" value={workDaysInput} min="0"
                  onChange={e => setWorkDaysInput(e.target.value)} />
              </FormField>
              <div className={`rounded-lg p-3 text-sm space-y-1 ${net >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                <p>✅ បានរក: <span className="font-bold text-green-700">{formatCurrency(earned)}</span></p>
                <p>🔴 នៅជំពាក់: <span className="font-bold">{formatCurrency(showWorkDays.remainingAmount)}</span></p>
                <p className="border-t pt-1 font-bold">
                  {net >= 0
                    ? <span className="text-green-700">💚 ម្ចាស់ជំពាក់: {formatCurrency(net)}</span>
                    : <span className="text-red-700">🔴 នៅជំពាក់: {formatCurrency(Math.abs(net))}</span>
                  }
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowWorkDays(null)} className="btn-secondary">បោះបង់</button>
                <button onClick={handleSaveWorkDays} className="btn-primary">រក្សាទុក</button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* ── Repay Modal ── */}
      <Modal open={!!showPay} onClose={() => setShowPay(null)} title="ទូទាត់បំណុល" size="sm">
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
            <p>ឈ្មោះ: <span className="font-semibold">{showPay?.entityName}</span></p>
            <p>ចំនួនសរុប: <span className="font-semibold">{formatCurrency(showPay?.totalAmount || 0)}</span></p>
            <p>នៅជំពាក់: <span className="font-semibold text-red-600">{formatCurrency(showPay?.remainingAmount || 0)}</span></p>
          </div>
          <FormField label="ចំនួនទូទាត់ (៛)" required>
            <input type="number" className="input-field" value={payAmount}
              onChange={e => setPayAmount(e.target.value)} min="1" max={showPay?.remainingAmount} />
          </FormField>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowPay(null)} className="btn-secondary">បោះបង់</button>
            <button onClick={handlePay} disabled={saving} className="btn-primary">
              {saving ? 'កំពុង...' : 'ទូទាត់'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!delConfirm} onClose={() => setDelConfirm(null)} onConfirm={handleDelete}
        title="លុបបំណុល" message={`លុប "${delConfirm?.entityName}"?`} />
    </div>
  )
}