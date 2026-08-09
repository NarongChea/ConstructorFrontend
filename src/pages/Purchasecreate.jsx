import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { purchaseAPI, supplierAPI, partnerAPI, productAPI, variantAPI } from '../../api/index.js'
import { useDebounce } from '../../hooks/useDebounce.js'
import { formatCurrency } from '../../utils/formatters.js'
import { FormField, SearchBar } from '../../components/UI/index.jsx'

export default function PurchaseCreate() {
  const navigate = useNavigate()
  const [sourceType,  setSourceType]  = useState('supplier')
  const [supplierId,  setSupplierId]  = useState('')
  const [partnerId,   setPartnerId]   = useState('')
  const [suppliers,   setSuppliers]   = useState([])
  const [partners,    setPartners]    = useState([])
  const [note,        setNote]        = useState('')
  const [cart,        setCart]        = useState([])
  const [search,      setSearch]      = useState('')
  const [products,    setProducts]    = useState([])
  const [selectedProd,setSelectedProd]= useState(null)
  const [variants,    setVariants]    = useState([])
  const [loading,     setLoading]     = useState(false)
  const dSearch = useDebounce(search, 400)

  useEffect(() => {
    supplierAPI.list({ limit: 100 }).then(r => setSuppliers(Array.isArray(r.data) ? r.data : []))
    partnerAPI.list({ canSellToUs: true, limit: 100 }).then(r => setPartners(r.data?.partners ?? []))
  }, [])

  useEffect(() => {
    
    productAPI.list({ search: dSearch, limit: 8 }).then(r => setProducts(r.data?.products ?? []))
  }, [dSearch])

  const selectProduct = async (p) => {
    setSelectedProd(p); setSearch(''); setProducts([])
    const res = await variantAPI.listByProduct(p._id)
    setVariants(Array.isArray(res.data) ? res.data : [])
  }

  const addToCart = (variant) => {
    const existing = cart.findIndex(c => c.variantId === variant._id)
    if (existing >= 0) {
      const u = [...cart]; u[existing].quantity += 1
      u[existing].subtotal = u[existing].quantity * u[existing].unitCost
      setCart(u); return
    }
    setCart(p => [...p, {
      variantId: variant._id, sku: variant.sku,
      name: selectedProd?.name || '', unit: variant.unit, unitValue: variant.unitValue,
      quantity: 1, unitCost: variant.costPrice || 0, subtotal: variant.costPrice || 0,
    }])
  }

  const updateQty = (idx, qty) => {
    if (qty <= 0) { setCart(p => p.filter((_, i) => i !== idx)); return }
    const u = [...cart]; u[idx].quantity = qty; u[idx].subtotal = qty * u[idx].unitCost; setCart(u)
  }

  const updateCost = (idx, cost) => {
    const u = [...cart]; u[idx].unitCost = cost; u[idx].subtotal = u[idx].quantity * cost; setCart(u)
  }

  const totalCost = cart.reduce((s, c) => s + c.subtotal, 0)

  const submit = async () => {
    if (cart.length === 0) { toast.error('សូមបន្ថែមផលិតផល'); return }
    if (sourceType === 'supplier' && !supplierId) { toast.error('សូមជ្រើសអ្នកផ្គត់ផ្គង់'); return }
    if (sourceType === 'partner'  && !partnerId)  { toast.error('សូមជ្រើសដៃគូ'); return }
    const zeroPrice = cart.find(c => c.unitCost <= 0)
    if (zeroPrice) { toast.error(`សូមបំពេញតម្លៃទិញ: ${zeroPrice.sku}`); return }
    setLoading(true)
    try {
      await purchaseAPI.create({
        sourceType,
        supplierId: sourceType === 'supplier' ? supplierId : undefined,
        partnerId:  sourceType === 'partner'  ? partnerId  : undefined,
        note,
        items: cart.map(c => ({ variantId: c.variantId, quantity: c.quantity, unitCost: c.unitCost })),
      })
      toast.success('ការទិញបានរក្សាទុក ស្ទុំបានបន្ថែមរួចហើយ!')
      navigate('/purchases')
    } catch { } finally { setLoading(false) }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Left */}
      <div className="lg:col-span-3 space-y-4">
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">ប្រភពទិញ</h3>
          <div className="flex gap-2 mb-4">
            {[['supplier','🏭 អ្នកផ្គត់ផ្គង់'],['partner','🤝 ដៃគូ']].map(([v,l]) => (
              <button key={v} onClick={() => setSourceType(v)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${sourceType===v ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                {l}
              </button>
            ))}
          </div>
          {sourceType === 'supplier' ? (
            <FormField label="អ្នកផ្គត់ផ្គង់" required>
              <select className="input-field" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                <option value="">-- ជ្រើស --</option>
                {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </FormField>
          ) : (
            <FormField label="ដៃគូ" required>
              <select className="input-field" value={partnerId} onChange={e => setPartnerId(e.target.value)}>
                <option value="">-- ជ្រើស --</option>
                {partners.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
            </FormField>
          )}
        </div>

        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">🔍 ស្វែងរកផលិតផល</h3>
          <div className="relative">
            <SearchBar value={search} onChange={setSearch} placeholder="ស្វែងរក..." />
            {products.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10">
                {products.map(p => (
                  <button key={p._id} onClick={() => selectProduct(p)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-primary-50 text-left">
                    <span>📦</span>
                    <div>
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.categoryId?.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedProd && variants.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {variants.map(v => (
                <button key={v._id} onClick={() => addToCart(v)}
                  className="text-left p-3 rounded-lg border border-gray-200 hover:border-primary-400 hover:bg-primary-50 transition-colors">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-mono text-gray-400">{v.sku}</span>
                    <span className="badge-gray text-xs">{v.stock}</span>
                  </div>
                  <p className="text-sm font-medium mt-0.5">{v.unitValue} {v.unit}</p>
                  <p className="text-xs text-gray-400">{v.brand || '—'}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Cart */}
      <div className="lg:col-span-2">
        <div className="card sticky top-4">
          <div className="p-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">📋 ទំនិញទិញ ({cart.length})</h3>
          </div>
          <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
            {cart.length === 0 && (
              <div className="py-10 text-center text-gray-400 text-sm">ស្វែងរក និងជ្រើសផលិតផល</div>
            )}
            {cart.map((item, idx) => (
              <div key={idx} className="p-3">
                <div className="flex justify-between mb-1.5">
                  <div>
                    <p className="text-sm font-medium text-gray-700">{item.name}</p>
                    <p className="text-xs text-gray-400">{item.unitValue} {item.unit}</p>
                  </div>
                  <button onClick={() => setCart(p => p.filter((_,i) => i !== idx))} className="text-red-400 hover:text-red-600 p-0.5">✕</button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                    <button onClick={() => updateQty(idx, item.quantity-1)} className="px-2 py-1 text-gray-500 hover:bg-gray-50 text-sm">−</button>
                    <input type="number" value={item.quantity} min="1" onChange={e => updateQty(idx, +e.target.value)}
                      className="w-12 text-center text-sm border-x border-gray-200 py-1 focus:outline-none" />
                    <button onClick={() => updateQty(idx, item.quantity+1)} className="px-2 py-1 text-gray-500 hover:bg-gray-50 text-sm">+</button>
                  </div>
                  <span className="text-gray-400 text-xs">×</span>
                  <input type="number" value={item.unitCost} min="0" onChange={e => updateCost(idx, +e.target.value)}
                    className="w-28 input-field text-xs py-1 text-right" placeholder="ថ្លៃទិញ" />
                  <span className="text-sm font-semibold text-red-600 ml-auto whitespace-nowrap">{formatCurrency(item.subtotal)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-gray-100 space-y-3">
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="ចំណាំ..." className="input-field text-xs py-1.5" />
            <div className="bg-red-50 rounded-xl p-3 flex justify-between items-center">
              <span className="text-sm font-medium text-red-700">ចំណាយសរុប:</span>
              <span className="text-lg font-bold text-red-700">{formatCurrency(totalCost)}</span>
            </div>
            <button onClick={submit} disabled={loading || cart.length === 0} className="btn-primary w-full justify-center py-3">
              {loading ? 'កំពុងរក្សា...' : '✅ រក្សាទុកការទិញ'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}