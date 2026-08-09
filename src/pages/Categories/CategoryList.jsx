import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { categoryAPI } from '../../api/index.js'
import { useDebounce } from '../../hooks/useDebounce.js'
import Modal from '../../components/UI/Modal.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import { EmptyState, PageLoader, SearchBar, FormField } from '../../components/UI/index.jsx'

const EMPTY = { name: '', description: '' }

export default function CategoryList() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [showModal, setShowModal]   = useState(false)
  const [editing, setEditing]       = useState(null)
  const [form, setForm]             = useState(EMPTY)
  const [saving, setSaving]         = useState(false)
  const [delConfirm, setDelConfirm] = useState(null)
  const dSearch = useDebounce(search, 400)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await categoryAPI.list({ search: dSearch || undefined })
      setCategories(Array.isArray(res.data) ? res.data : [])
    } catch { } finally { setLoading(false) }
  }, [dSearch])

  useEffect(() => { load() }, [load])

  const openEdit = (c) => {
    setEditing(c)
    setForm(c ? { name: c.name, description: c.description || '' } : EMPTY)
    setShowModal(true)
  }

  const save = async () => {
    if (!form.name) { toast.error('សូមបំពេញឈ្មោះ'); return }
    setSaving(true)
    try {
      if (editing) { await categoryAPI.update(editing._id, form); toast.success('កែប្រែដោយជោគជ័យ') }
      else         { await categoryAPI.create(form);               toast.success('បន្ថែមដោយជោគជ័យ') }
      setShowModal(false); load()
    } catch { } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    await categoryAPI.delete(delConfirm._id)
    toast.success('លុបដោយជោគជ័យ')
    setDelConfirm(null); load()
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="p-4 border-b border-gray-100 flex flex-wrap gap-2">
          <SearchBar value={search} onChange={setSearch} placeholder="ស្វែងរកប្រភេទ..." />
          <div className="flex-1" />
          <button onClick={() => openEdit(null)} className="btn-primary">+ ប្រភេទថ្មី</button>
        </div>

        {loading ? <PageLoader /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {categories.length === 0 && <div className="col-span-3"><EmptyState icon="🗂️" title="គ្មានប្រភេទ" message="ចុច '+ ប្រភេទថ្មី' ដើម្បីបន្ថែម" /></div>}
            {categories.map(c => (
              <div key={c._id} className="border border-gray-200 rounded-xl p-4 hover:border-primary-300 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-800">{c.name}</p>
                    {c.description && <p className="text-sm text-gray-400 mt-0.5">{c.description}</p>}
                    <p className="text-xs text-gray-400 mt-1">{c.productCount || 0} ផលិតផល</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(c)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg">✏️</button>
                    <button onClick={() => setDelConfirm(c)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg">🗑️</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'កែប្រែប្រភេទ' : 'ប្រភេទថ្មី'} size="sm">
        <div className="space-y-3">
          <FormField label="ឈ្មោះ" required>
            <input className="input-field" value={form.name} onChange={e => setForm(p=>({...p,name:e.target.value}))} placeholder="ឧ: ស៊ីម៉ង់, ដែក..." />
          </FormField>
          <FormField label="ការពិពណ៌នា">
            <textarea className="input-field" rows={2} value={form.description} onChange={e => setForm(p=>({...p,description:e.target.value}))} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <button onClick={() => setShowModal(false)} className="btn-secondary">បោះបង់</button>
            <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'កំពុង...' : 'រក្សាទុក'}</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!delConfirm} onClose={() => setDelConfirm(null)} onConfirm={handleDelete}
        title="លុបប្រភេទ" message={`លុប "${delConfirm?.name}"?`} />
    </div>
  )
}