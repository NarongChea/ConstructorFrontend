import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { partnerAPI } from '../../api/index.js'
import { useDebounce } from '../../hooks/useDebounce.js'
import Pagination from '../../components/UI/Pagination.jsx'
import Modal from '../../components/UI/Modal.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import { EmptyState, PageLoader, SearchBar, FormField } from '../../components/UI/index.jsx'

const EMPTY = { name: '', contact: '', phone: '', email: '', address: '', note: '', canBuyFromUs: true, canSellToUs: false }

export default function PartnerList() {
  const [partners,   setPartners]   = useState([])
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
      const res = await partnerAPI.list({ page, limit: 20, search: dSearch || undefined })
      setPartners(res.data?.partners ?? [])
      setPagination(res.data?.pagination ?? null)
    } catch { } finally { setLoading(false) }
  }, [page, dSearch])

  useEffect(() => { load() }, [load])

  const openEdit = (p) => {
    setEditing(p)
    setForm(p ? { name:p.name, contact:p.contact||'', phone:p.phone||'', email:p.email||'',
      address:p.address||'', note:p.note||'', canBuyFromUs:p.canBuyFromUs, canSellToUs:p.canSellToUs } : EMPTY)
    setShowModal(true)
  }

  const save = async () => {
    if (!form.name) { toast.error('សូមបំពេញឈ្មោះ'); return }
    if (!form.canBuyFromUs && !form.canSellToUs) { toast.error('ត្រូវមានយ៉ាងហោចណាស់ 1 តួនាទី'); return }
    setSaving(true)
    try {
      if (editing) { await partnerAPI.update(editing._id, form); toast.success('កែប្រែដោយជោគជ័យ') }
      else         { await partnerAPI.create(form);              toast.success('បន្ថែមដោយជោគជ័យ') }
      setShowModal(false); load()
    } catch { } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    await partnerAPI.delete(delConfirm._id)
    toast.success('លុបដោយជោគជ័យ')
    setDelConfirm(null); load()
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="p-4 border-b border-gray-100 flex flex-wrap gap-2">
          <SearchBar value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="ស្វែងរកដៃគូ..." />
          <div className="flex-1" />
          <button onClick={() => openEdit(null)} className="btn-primary">+ ដៃគូថ្មី</button>
        </div>

        {loading ? <PageLoader /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header text-left">ឈ្មោះ</th>
                    <th className="table-header text-left">ទំនាក់ទំនង</th>
                    <th className="table-header text-center">អ្នកទិញ</th>
                    <th className="table-header text-center">អ្នកលក់</th>
                    <th className="table-header text-center">ស្ថានភាព</th>
                    <th className="table-header text-center">សកម្មភាព</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.length === 0 && (
                    <tr><td colSpan={6}><EmptyState icon="🤝" title="គ្មានដៃគូ" message="ចុច '+ ដៃគូថ្មី' ដើម្បីបន្ថែម" /></td></tr>
                  )}
                  {partners.map(p => (
                    <tr key={p._id} className="hover:bg-gray-50">
                      <td className="table-cell">
                        <p className="font-semibold text-gray-800">{p.name}</p>
                        {p.note && <p className="text-xs text-gray-400 mt-0.5">{p.note}</p>}
                      </td>
                      <td className="table-cell">
                        {p.phone && <p className="text-sm">📞 {p.phone}</p>}
                        {p.email && <p className="text-xs text-gray-400">{p.email}</p>}
                        {p.contact && <p className="text-xs text-gray-500">{p.contact}</p>}
                      </td>
                      <td className="table-cell text-center">
                        <span className={p.canBuyFromUs ? 'badge-green' : 'badge-gray'}>{p.canBuyFromUs ? '✓' : '—'}</span>
                      </td>
                      <td className="table-cell text-center">
                        <span className={p.canSellToUs ? 'badge-purple' : 'badge-gray'}>{p.canSellToUs ? '✓' : '—'}</span>
                      </td>
                      <td className="table-cell text-center">
                        <span className={p.isActive ? 'badge-green' : 'badge-red'}>{p.isActive ? 'សកម្ម' : 'អសកម្ម'}</span>
                      </td>
                      <td className="table-cell text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Link to={`/partners/${p._id}`} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-sm transition-colors" title="ព័ត៌មានលម្អិត">
                            💰
                          </Link>
                          <button onClick={() => openEdit(p)} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">✏️</button>
                          <button onClick={() => setDelConfirm(p)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors">🗑️</button>
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

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'កែប្រែដៃគូ' : 'ដៃគូថ្មី'} size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="ឈ្មោះ" required className="col-span-2">
              <input className="input-field" value={form.name} onChange={e => setForm(p=>({...p,name:e.target.value}))} placeholder="ឈ្មោះដៃគូ..." />
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
              <input className="input-field" value={form.note} onChange={e => setForm(p=>({...p,note:e.target.value}))} />
            </FormField>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">តួនាទី</p>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.canBuyFromUs} onChange={e => setForm(p=>({...p,canBuyFromUs:e.target.checked}))} className="rounded text-primary-600" />
                <span className="text-sm text-gray-700">ទិញផលិតផលពីយើង</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.canSellToUs} onChange={e => setForm(p=>({...p,canSellToUs:e.target.checked}))} className="rounded text-primary-600" />
                <span className="text-sm text-gray-700">លក់ទំនិញឱ្យយើង</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button onClick={() => setShowModal(false)} className="btn-secondary">បោះបង់</button>
            <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'កំពុង...' : 'រក្សាទុក'}</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!delConfirm} onClose={() => setDelConfirm(null)} onConfirm={handleDelete}
        title="លុបដៃគូ" message={`លុប "${delConfirm?.name}"?`} />
    </div>
  )
}