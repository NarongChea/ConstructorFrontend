import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { userPriceAPI, partnerAPI, variantAPI } from '../../api/index.js'
import { useDebounce } from '../../hooks/useDebounce.js'
import Modal from '../../components/UI/Modal.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import { EmptyState, PageLoader, FormField, SearchBar } from '../../components/UI/index.jsx'
import { formatCurrency } from '../../utils/formatters.js'

export default function UserPriceList() {
  const [partners,   setPartners]   = useState([])
  const [selPartner, setSelPartner] = useState('')
  const [prices,     setPrices]     = useState([])
  const [loading,    setLoading]    = useState(false)
  const [showModal,  setShowModal]  = useState(false)
  const [editing,    setEditing]    = useState(null)
  const [saving,     setSaving]     = useState(false)
  const [delConfirm, setDelConfirm] = useState(null)
  // variant search
  const [vSearch,    setVSearch]    = useState('')
  const [variants,   setVariants]   = useState([])
  const [selVariant, setSelVariant] = useState(null)
  const [price,      setPrice]      = useState('')
  const [note,       setNote]       = useState('')
  const dVSearch = useDebounce(vSearch, 400)

  useEffect(() => {
    partnerAPI.list({ limit: 100 }).then(r => setPartners(r.data?.partners ?? []))
  }, [])

  useEffect(() => {
    if (!selPartner) { setPrices([]); return }
    setLoading(true)
    userPriceAPI.forPartner(selPartner).then(r => setPrices(Array.isArray(r.data) ? r.data : [])).catch(()=>{}).finally(()=>setLoading(false))
  }, [selPartner])

  useEffect(() => {
    if (!dVSearch || dVSearch.length < 2) { setVariants([]); return }
    variantAPI.list({ search: dVSearch, limit: 8 }).then(r => setVariants(Array.isArray(r.data) ? r.data : []))
  }, [dVSearch])

  const openCreate = () => {
    setEditing(null); setSelVariant(null); setPrice(''); setNote(''); setVSearch(''); setVariants([])
    setShowModal(true)
  }

  const openEdit = (pr) => {
    setEditing(pr); setSelVariant(pr.variantId); setPrice(pr.price); setNote(pr.note || '')
    setShowModal(true)
  }

  const save = async () => {
    if (!selPartner)        { toast.error('សូមជ្រើសដៃគូ'); return }
    if (!selVariant && !editing) { toast.error('សូមជ្រើស Variant'); return }
    if (!price || +price < 0)    { toast.error('សូមបំពេញតម្លៃ'); return }
    setSaving(true)
    try {
      await userPriceAPI.upsert({
        variantId: editing ? editing.variantId?._id || editing.variantId : selVariant._id,
        partnerId: selPartner,
        price: +price, note,
      })
      toast.success('រក្សាទុកតម្លៃដោយជោគជ័យ')
      setShowModal(false)
      const r = await userPriceAPI.forPartner(selPartner)
      setPrices(Array.isArray(r.data) ? r.data : [])
    } catch { } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    await userPriceAPI.delete(delConfirm._id)
    toast.success('លុបដោយជោគជ័យ')
    setDelConfirm(null)
    const r = await userPriceAPI.forPartner(selPartner)
    setPrices(Array.isArray(r.data) ? r.data : [])
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">ជ្រើសដៃគូ / អតិថិជន</label>
            <select value={selPartner} onChange={e => setSelPartner(e.target.value)} className="input-field text-sm py-2 w-full sm:w-72">
              <option value="">-- ជ្រើសសិន --</option>
              {partners.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </div>
          {selPartner && (
            <div className="flex items-end">
              <button onClick={openCreate} className="btn-primary">+ តម្លៃពិសេស</button>
            </div>
          )}
        </div>

        {!selPartner ? (
          <EmptyState icon="💲" title="ជ្រើសដៃគូ" message="ជ្រើសដៃគូ ឬ អតិថិជន ដើម្បីមើលតម្លៃពិសេស" />
        ) : loading ? <PageLoader /> : (
          <>
            {prices.length === 0 ? (
              <EmptyState icon="💲" title="គ្មានតម្លៃពិសេស" message="ចុច '+ តម្លៃពិសេស' ដើម្បីកំណត់" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="table-header text-left">SKU</th>
                      <th className="table-header text-left">ផលិតផល</th>
                      <th className="table-header text-left">ឯកតា</th>
                      <th className="table-header text-right">តម្លៃស្តង់ដារ</th>
                      <th className="table-header text-right">តម្លៃពិសេស</th>
                      <th className="table-header text-right">ចំណេញ</th>
                      <th className="table-header text-left">ចំណាំ</th>
                      <th className="table-header text-center">សកម្មភាព</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prices.map(pr => {
                      const diff = (pr.variantId?.price || 0) - pr.price
                      return (
                        <tr key={pr._id} className="hover:bg-gray-50">
                          <td className="table-cell font-mono text-xs">{pr.variantId?.sku || '—'}</td>
                          <td className="table-cell text-gray-700">—</td>
                          <td className="table-cell text-sm">{pr.variantId?.unitValue} {pr.variantId?.unit}</td>
                          <td className="table-cell text-right text-gray-400">{formatCurrency(pr.variantId?.price)}</td>
                          <td className="table-cell text-right font-semibold text-primary-600">{formatCurrency(pr.price)}</td>
                          <td className="table-cell text-right">
                            <span className={diff >= 0 ? 'text-red-500' : 'text-green-600'}>
                              {diff >= 0 ? '▼' : '▲'} {formatCurrency(Math.abs(diff))}
                            </span>
                          </td>
                          <td className="table-cell text-xs text-gray-400">{pr.note || '—'}</td>
                          <td className="table-cell text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => openEdit(pr)} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg">✏️</button>
                              <button onClick={() => setDelConfirm(pr)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg">🗑️</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'កែប្រែតម្លៃ' : 'តម្លៃពិសេសថ្មី'} size="sm">
        <div className="space-y-4">
          {!editing && (
            <FormField label="ស្វែងរក Variant">
              <div className="relative">
                <SearchBar value={vSearch} onChange={setVSearch} placeholder="SKU ឬ ឈ្មោះ..." />
                {variants.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10">
                    {variants.map(v => (
                      <button key={v._id} onClick={() => { setSelVariant(v); setVariants([]); setVSearch(v.sku) }}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left text-sm">
                        <span className="font-mono text-xs text-gray-400">{v.sku}</span>
                        <span>{v.unitValue} {v.unit}</span>
                        <span className="ml-auto text-gray-400">{formatCurrency(v.price)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selVariant && (
                <div className="mt-2 bg-primary-50 rounded-lg p-2.5 text-xs">
                  <p className="font-medium">SKU: {selVariant.sku}</p>
                  <p className="text-gray-500">ឯកតា: {selVariant.unitValue} {selVariant.unit}</p>
                  <p className="text-gray-500">តម្លៃស្តង់ដារ: {formatCurrency(selVariant.price)}</p>
                </div>
              )}
            </FormField>
          )}
          <FormField label="តម្លៃពិសេស (រៀល)" required>
            <input type="number" min="0" className="input-field" value={price} onChange={e => setPrice(e.target.value)} placeholder="0" />
          </FormField>
          <FormField label="ចំណាំ">
            <input className="input-field" value={note} onChange={e => setNote(e.target.value)} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <button onClick={() => setShowModal(false)} className="btn-secondary">បោះបង់</button>
            <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'កំពុង...' : 'រក្សាទុក'}</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!delConfirm} onClose={() => setDelConfirm(null)} onConfirm={handleDelete}
        title="លុបតម្លៃ" message="លុបតម្លៃពិសេសនេះ?" />
    </div>
  )
}