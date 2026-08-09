import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { supplierAPI } from '../../api/index.js'
import { useDebounce } from '../../hooks/useDebounce.js'
import Pagination from '../../components/UI/Pagination.jsx'
import Modal from '../../components/UI/Modal.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import { EmptyState, PageLoader, SearchBar, FormField } from '../../components/UI/index.jsx'

const EMPTY = { name: '', contact: '', phone: '', email: '', address: '', note: '' }

export default function SupplierList() {
  const [suppliers,  setSuppliers]  = useState([])
  const [pagination, setPagination] = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [page,       setPage]       = useState(1)
  const [showModal,  setShowModal]  = useState(false)
  const [editing,    setEditing]    = useState(null)
  const [form,       setForm]       = useState(EMPTY)
  const [saving,     setSaving]     = useState(false)
  const [delConfirm, setDelConfirm] = useState(null)
  const dSearch = useDebounce(search, 400)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await supplierAPI.list({ page, limit: 20, search: dSearch || undefined })
      setSuppliers(Array.isArray(res.data) ? res.data : [])
      setPagination(null)
    } catch { } finally { setLoading(false) }
  }, [page, dSearch])

  useEffect(() => { load() }, [load])

  const openEdit = (s) => {
    setEditing(s)
    setForm(s ? { name:s.name,contact:s.contact||'',phone:s.phone||'',email:s.email||'',address:s.address||'',note:s.note||'' } : EMPTY)
    setShowModal(true)
  }

  const save = async () => {
    if (!form.name) { toast.error('សូមបំពេញឈ្មោះ'); return }
    setSaving(true)
    try {
      if (editing) { await supplierAPI.update(editing._id, form); toast.success('កែប្រែដោយជោគជ័យ') }
      else         { await supplierAPI.create(form);              toast.success('បន្ថែមដោយជោគជ័យ') }
      setShowModal(false); load()
    } catch { } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    await supplierAPI.delete(delConfirm._id)
    toast.success('លុបដោយជោគជ័យ')
    setDelConfirm(null); load()
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="p-4 border-b border-gray-100 flex flex-wrap gap-2">
          <SearchBar value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="ស្វែងរកអ្នកផ្គត់ផ្គង់..." />
          <div className="flex-1" />
          <button onClick={() => openEdit(null)} className="btn-primary">+ អ្នកផ្គត់ផ្គង់ថ្មី</button>
        </div>

        {loading ? <PageLoader /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header text-left">ឈ្មោះ</th>
                    <th className="table-header text-left">ទំនាក់ទំនង</th>
                    <th className="table-header text-left">អ៊ីមែល</th>
                    <th className="table-header text-left">អាសយដ្ឋាន</th>
                    <th className="table-header text-center">សកម្មភាព</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.length === 0 && (
                    <tr><td colSpan={5}><EmptyState icon="🏭" title="គ្មានអ្នកផ្គត់ផ្គង់" /></td></tr>
                  )}
                  {suppliers.map(s => (
                    <tr key={s._id} className="hover:bg-gray-50">
                      <td className="table-cell">
                        <p className="font-semibold text-gray-800">{s.name}</p>
                        {s.note && <p className="text-xs text-gray-400 mt-0.5">{s.note}</p>}
                      </td>
                      <td className="table-cell">
                        {s.phone && <p className="text-sm">📞 {s.phone}</p>}
                        {s.contact && <p className="text-xs text-gray-400">{s.contact}</p>}
                      </td>
                      <td className="table-cell text-sm text-gray-500">{s.email || '—'}</td>
                      <td className="table-cell text-sm text-gray-500">{s.address || '—'}</td>
                      <td className="table-cell text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openEdit(s)} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg">✏️</button>
                          <button onClick={() => setDelConfirm(s)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg">🗑️</button>
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

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'កែប្រែអ្នកផ្គត់ផ្គង់' : 'អ្នកផ្គត់ផ្គង់ថ្មី'} size="md">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="ឈ្មោះ" required className="col-span-2">
              <input className="input-field" value={form.name} onChange={e => setForm(p=>({...p,name:e.target.value}))} />
            </FormField>
            <FormField label="អ្នកទំនាក់ទំនង">
              <input className="input-field" value={form.contact} onChange={e => setForm(p=>({...p,contact:e.target.value}))} />
            </FormField>
            <FormField label="ទូរស័ព្ទ">
              <input className="input-field" value={form.phone} onChange={e => setForm(p=>({...p,phone:e.target.value}))} />
            </FormField>
            <FormField label="អ៊ីមែល">
              <input type="email" className="input-field" value={form.email} onChange={e => setForm(p=>({...p,email:e.target.value}))} />
            </FormField>
            <FormField label="អាសយដ្ឋាន">
              <input className="input-field" value={form.address} onChange={e => setForm(p=>({...p,address:e.target.value}))} />
            </FormField>
            <FormField label="ចំណាំ" className="col-span-2">
              <textarea className="input-field" rows={2} value={form.note} onChange={e => setForm(p=>({...p,note:e.target.value}))} />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <button onClick={() => setShowModal(false)} className="btn-secondary">បោះបង់</button>
            <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'កំពុង...' : 'រក្សាទុក'}</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!delConfirm} onClose={() => setDelConfirm(null)} onConfirm={handleDelete}
        title="លុបអ្នកផ្គត់ផ្គង់" message={`លុប "${delConfirm?.name}"?`} />
    </div>
  )
}