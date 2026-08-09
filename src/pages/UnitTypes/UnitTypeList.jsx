import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { unitTypeAPI } from '../../api/index.js'
import Modal from '../../components/UI/Modal.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import { EmptyState, PageLoader, FormField } from '../../components/UI/index.jsx'

const PRESETS = [
  { name: 'screw',  displayName: 'sskew',   measurements: [{ label: 'ក្រាម', symbol: 'g' }, { label: 'គីឡូក្រាម', symbol: 'kg' }, { label: 'ប្រអប់', symbol: 'box' }] },
  { name: 'bottle', displayName: 'ដប',       measurements: [{ label: '0.3L', symbol: '0.3L' }, { label: '0.5L', symbol: '0.5L' }, { label: '1L', symbol: '1L' }, { label: '4L', symbol: '4L' }] },
  { name: 'bag',    displayName: 'ថង់',       measurements: [{ label: '10kg', symbol: '10kg' }, { label: '25kg', symbol: '25kg' }, { label: '50kg', symbol: '50kg' }] },
  { name: 'piece',  displayName: 'គ្រាប់/ដំ', measurements: [{ label: 'ដំ', symbol: 'pcs' }, { label: 'ប្រអប់ 100', symbol: 'box100' }, { label: 'ប្រអប់ 500', symbol: 'box500' }] },
  { name: 'sheet',  displayName: 'សន្លឹក',     measurements: [{ label: 'សន្លឹក', symbol: 'sheet' }, { label: '10 សន្លឹក', symbol: '10sheet' }] },
  { name: 'set',    displayName: 'ស្សេ',       measurements: [{ label: 'ស្សេ', symbol: 'set' }] },
]

const EMPTY = { name: '', displayName: '', measurements: [] }

export default function UnitTypeList() {
  const [unitTypes, setUnitTypes] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing,   setEditing]   = useState(null)
  const [form,      setForm]      = useState(EMPTY)
  const [saving,    setSaving]    = useState(false)
  const [delConfirm, setDelConfirm] = useState(null)
  const [showAddMeasure, setShowAddMeasure] = useState(null)
  const [newMeasure, setNewMeasure] = useState({ label: '', symbol: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await unitTypeAPI.list()
      setUnitTypes(Array.isArray(res.data) ? res.data : [])
    } catch { } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const openEdit = (ut) => {
    setEditing(ut)
    setForm(ut ? { name: ut.name, displayName: ut.displayName || ut.name, measurements: [...ut.measurements] } : EMPTY)
    setShowModal(true)
  }

  const usePreset = (p) => {
    setForm({ name: p.name, displayName: p.displayName, measurements: [...p.measurements] })
  }

  const addMeasure = () => {
    if (!form.measurements.some(m => m.symbol)) { }
    if (!newMeasure.label || !newMeasure.symbol) { toast.error('សូមបំពេញ label និង symbol'); return }
    setForm(p => ({ ...p, measurements: [...p.measurements, { ...newMeasure }] }))
    setNewMeasure({ label: '', symbol: '' })
  }

  const removeMeasure = (sym) => {
    if (form.measurements.length <= 1) { toast.error('ត្រូវតែមានយ៉ាងហោចណាស់ 1 ការវាស់'); return }
    setForm(p => ({ ...p, measurements: p.measurements.filter(m => m.symbol !== sym) }))
  }

  const save = async () => {
    if (!form.name || form.measurements.length === 0) { toast.error('សូមបំពេញព័ត៌មានចាំបាច់'); return }
    setSaving(true)
    try {
      if (editing) {
        await unitTypeAPI.update(editing._id, { displayName: form.displayName, measurements: form.measurements })
        toast.success('កែប្រែដោយជោគជ័យ')
      } else {
        await unitTypeAPI.create(form)
        toast.success('បន្ថែមដោយជោគជ័យ')
      }
      setShowModal(false); load()
    } catch { } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    await unitTypeAPI.delete(delConfirm._id)
    toast.success('លុបដោយជោគជ័យ')
    setDelConfirm(null); load()
  }

  const seedAll = async () => {
    const PRESETS = [
      { name: 'screw',  displayName: 'sskew',   measurements: [{ label: 'ក្រាម', symbol: 'g' }, { label: 'គីឡូ', symbol: 'kg' }, { label: 'ប្រអប់', symbol: 'box' }] },
      { name: 'bottle', displayName: 'ដប',       measurements: [{ label: '0.3L', symbol: '0.3L' }, { label: '0.5L', symbol: '0.5L' }, { label: '1L', symbol: '1L' }, { label: '4L', symbol: '4L' }] },
      { name: 'bag',    displayName: 'ថង់',       measurements: [{ label: '10kg', symbol: '10kg' }, { label: '25kg', symbol: '25kg' }, { label: '50kg', symbol: '50kg' }] },
      { name: 'piece',  displayName: 'គ្រាប់/ដំ', measurements: [{ label: 'ដំ', symbol: 'pcs' }, { label: 'ប្រអប់', symbol: 'box100' }] },
      { name: 'sheet',  displayName: 'សន្លឹក',    measurements: [{ label: 'សន្លឹក', symbol: 'sheet' }] },
      { name: 'meter',  displayName: 'មែត្រ',     measurements: [{ label: 'មែត្រ', symbol: 'm' }, { label: 'សង់ទីម', symbol: 'cm' }] },
      { name: 'liter',  displayName: 'លីត្រ',     measurements: [{ label: 'លីត្រ', symbol: 'L' }, { label: 'មីលីលីត្រ', symbol: 'ml' }] },
    ]
    let created = 0
    for (const p of PRESETS) {
      try { await unitTypeAPI.create(p); created++ } catch {}
    }
    toast.success(`បន្ថែម ${created} ប្រភេទ!`)
    load()
  }

  const addMeasurementToExisting = async () => {
    if (!newMeasure.label || !newMeasure.symbol) { toast.error('សូមបំពេញព័ត៌មាន'); return }
    await unitTypeAPI.addMeasurement(showAddMeasure._id, newMeasure)
    toast.success('បន្ថែមការវាស់ដោយជោគជ័យ')
    setShowAddMeasure(null); setNewMeasure({ label: '', symbol: '' }); load()
  }

  const removeMeasurementFromExisting = async (ut, sym) => {
    if (ut.measurements.length <= 1) { toast.error('ត្រូវតែមានយ៉ាងហោចណាស់ 1 ការវាស់'); return }
    await unitTypeAPI.removeMeasurement(ut._id, sym)
    toast.success('លុបដោយជោគជ័យ')
    load()
  }

  if (loading) return <PageLoader />

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-800">ប្រភេទឯកតា</h2>
            <p className="text-xs text-gray-400 mt-0.5">ប្រភេទ: screw, bottle, ថង់, ... + ការវាស់ (g, kg, L, ...)</p>
          </div>
          <div className="flex gap-2">
            <button onClick={seedAll} className="px-3 py-2 text-sm border border-indigo-300 text-indigo-600 rounded-lg hover:bg-indigo-50">⚡ Preset ទាំងអស់</button>
            <button onClick={() => openEdit(null)} className="btn-primary">+ ប្រភេទថ្មី</button>
          </div>
        </div>

        {unitTypes.length === 0 ? (
          <EmptyState icon="📐" title="គ្មានប្រភេទឯកតា" message="ចុច '+ ប្រភេទថ្មី' ដើម្បីបន្ថែម" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {unitTypes.map(ut => (
              <div key={ut._id} className={`border rounded-xl p-4 ${ut.isActive ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-800">{ut.displayName || ut.name}</h3>
                    <p className="text-xs text-gray-400 font-mono">{ut.name}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(ut)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg text-sm">✏️</button>
                    <button onClick={() => setDelConfirm(ut)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg text-sm">🗑️</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {ut.measurements.map(m => (
                    <div key={m.symbol} className="group flex items-center gap-1 bg-primary-50 text-primary-700 rounded-full px-2.5 py-1 text-xs font-medium">
                      {m.label}
                      <button
                        onClick={() => removeMeasurementFromExisting(ut, m.symbol)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-primary-400 hover:text-red-500"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => { setShowAddMeasure(ut); setNewMeasure({ label: '', symbol: '' }) }}
                  className="text-xs text-primary-600 hover:underline"
                >
                  + បន្ថែមការវាស់
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'កែប្រែប្រភេទឯកតា' : 'ប្រភេទឯកតាថ្មី'} size="md">
        <div className="space-y-4">
          {!editing && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">ប្រើ Preset</p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map(p => (
                  <button key={p.name} onClick={() => usePreset(p)} className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-primary-100 hover:text-primary-700 rounded-full transition-colors">
                    {p.displayName}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <FormField label="ឈ្មោះ (key)" required>
              <input className="input-field" value={form.name} onChange={e => setForm(p=>({...p, name: e.target.value.toLowerCase()}))} placeholder="screw, bottle..." disabled={!!editing} />
            </FormField>
            <FormField label="ឈ្មោះបង្ហាញ">
              <input className="input-field" value={form.displayName} onChange={e => setForm(p=>({...p, displayName: e.target.value}))} placeholder="sskew, ដប..." />
            </FormField>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">ការវាស់ <span className="text-red-500">*</span></p>
            <div className="space-y-2 mb-3">
              {form.measurements.map((m, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-sm font-medium text-gray-700 flex-1">{m.label}</span>
                  <span className="text-xs text-gray-400 font-mono bg-white border border-gray-200 px-2 py-0.5 rounded">{m.symbol}</span>
                  <button onClick={() => removeMeasure(m.symbol)} className="text-red-400 hover:text-red-600 text-sm">✕</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newMeasure.label} onChange={e => setNewMeasure(p=>({...p, label: e.target.value}))} placeholder="label (ឧ: ក្រាម)" className="input-field flex-1 text-sm" />
              <input value={newMeasure.symbol} onChange={e => setNewMeasure(p=>({...p, symbol: e.target.value}))} placeholder="symbol (ឧ: g)" className="input-field w-24 text-sm" />
              <button onClick={addMeasure} className="btn-secondary text-sm px-3">+</button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button onClick={() => setShowModal(false)} className="btn-secondary">បោះបង់</button>
            <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'កំពុង...' : 'រក្សាទុក'}</button>
          </div>
        </div>
      </Modal>

      {/* Add Measurement to Existing */}
      <Modal open={!!showAddMeasure} onClose={() => setShowAddMeasure(null)} title={`បន្ថែមការវាស់ — ${showAddMeasure?.displayName}`} size="sm">
        <div className="space-y-3">
          <FormField label="label (ឧ: ក្រាម, 0.5L)">
            <input className="input-field" value={newMeasure.label} onChange={e => setNewMeasure(p=>({...p, label: e.target.value}))} />
          </FormField>
          <FormField label="symbol (ឧ: g, 0.5L)">
            <input className="input-field" value={newMeasure.symbol} onChange={e => setNewMeasure(p=>({...p, symbol: e.target.value}))} />
          </FormField>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAddMeasure(null)} className="btn-secondary">បោះបង់</button>
            <button onClick={addMeasurementToExisting} className="btn-primary">បន្ថែម</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!delConfirm} onClose={() => setDelConfirm(null)} onConfirm={handleDelete}
        title="លុបប្រភេទ" message={`លុប "${delConfirm?.displayName || delConfirm?.name}"?`}
      />
    </div>
  )
}