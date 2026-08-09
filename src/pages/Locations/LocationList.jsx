import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { locationAPI } from '../../api/index.js'
import { useDebounce } from '../../hooks/useDebounce.js'
import Modal from '../../components/UI/Modal.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import { EmptyState, PageLoader, SearchBar, FormField } from '../../components/UI/index.jsx'

const EMPTY = { name: '', zone: '', description: '' }

export default function LocationList() {
  const [locations,  setLocations]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [showModal,  setShowModal]  = useState(false)
  const [editing,    setEditing]    = useState(null)
  const [form,       setForm]       = useState(EMPTY)
  const [saving,     setSaving]     = useState(false)
  const [delConfirm, setDelConfirm] = useState(null)
  const dSearch = useDebounce(search, 400)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await locationAPI.list({ isActive: true })
      setLocations(Array.isArray(res.data) ? res.data : [])
    } catch { } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = locations.filter(l =>
    !dSearch ||
    l.name.toLowerCase().includes(dSearch.toLowerCase()) ||
    (l.zone || '').toLowerCase().includes(dSearch.toLowerCase())
  )

  const openEdit = (loc) => {
    setEditing(loc)
    setForm(loc ? { name: loc.name, zone: loc.zone || '', description: loc.description || '' } : EMPTY)
    setShowModal(true)
  }

  const save = async () => {
    if (!form.name) { toast.error('សូមបំពេញឈ្មោះទីកន្លែង'); return }
    setSaving(true)
    try {
      if (editing) {
        await locationAPI.update(editing._id, form)
        toast.success('កែប្រែដោយជោគជ័យ')
      } else {
        await locationAPI.create(form)
        toast.success('បន្ថែមដោយជោគជ័យ')
      }
      setShowModal(false); load()
    } catch { } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    await locationAPI.delete(delConfirm._id)
    toast.success('លុបដោយជោគជ័យ')
    setDelConfirm(null); load()
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="p-4 border-b border-gray-100 flex flex-wrap gap-2 items-center">
          <SearchBar value={search} onChange={setSearch} placeholder="ស្វែងរកទីកន្លែង..." />
          <div className="flex-1" />
          <button onClick={() => openEdit(null)} className="btn-primary">+ ទីកន្លែងថ្មី</button>
        </div>

        {loading ? <PageLoader /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {filtered.length === 0 && (
              <div className="col-span-3">
                <EmptyState icon="📍" title="គ្មានទីកន្លែង" message="ចុច '+ ទីកន្លែងថ្មី' ដើម្បីបន្ថែម" />
              </div>
            )}
            {filtered.map(loc => (
              <div key={loc._id} className="border border-gray-200 rounded-xl p-4 hover:border-primary-300 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📍</span>
                      <p className="font-semibold text-gray-800 truncate">{loc.name}</p>
                    </div>
                    {loc.zone && (
                      <span className="inline-block mt-1 text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                        {loc.zone}
                      </span>
                    )}
                    {loc.description && (
                      <p className="text-sm text-gray-400 mt-1 line-clamp-2">{loc.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1 ml-2">
                    <button onClick={() => openEdit(loc)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg">✏️</button>
                    <button onClick={() => setDelConfirm(loc)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg">🗑️</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)}
        title={editing ? 'កែប្រែទីកន្លែង' : 'ទីកន្លែងថ្មី'} size="sm">
        <div className="space-y-3">
          <FormField label="ឈ្មោះទីកន្លែង" required>
            <input
              className="input-field"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="ឧ: ឃ្លាំង A, ជំរំ 1..."
            />
          </FormField>
          <FormField label="តំបន់ (Zone)">
            <input
              className="input-field"
              value={form.zone}
              onChange={e => setForm(p => ({ ...p, zone: e.target.value }))}
              placeholder="ឧ: Zone A, ជាន់ 1..."
            />
          </FormField>
          <FormField label="ការពិពណ៌នា">
            <textarea
              className="input-field"
              rows={2}
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <button onClick={() => setShowModal(false)} className="btn-secondary">បោះបង់</button>
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? 'កំពុង...' : 'រក្សាទុក'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!delConfirm} onClose={() => setDelConfirm(null)} onConfirm={handleDelete}
        title="លុបទីកន្លែង" message={`តើអ្នកចង់លុប "${delConfirm?.name}" ពិតមែនទេ?`}
      />
    </div>
  )
}