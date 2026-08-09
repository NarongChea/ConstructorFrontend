import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { productAPI, categoryAPI, locationAPI, variantAPI, unitTypeAPI, stockAPI } from '../../api/index.js'
import { formatCurrency } from '../../utils/formatters.js'
import Modal from '../../components/UI/Modal.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import Pagination from '../../components/UI/Pagination.jsx'
import { EmptyState, PageLoader, SearchBar, FormField } from '../../components/UI/index.jsx'
import { useDebounce } from '../../hooks/useDebounce.js'

const PAGE_SIZE = 20
const EMPTY_PRODUCT = { name: '', description: '', categoryId: '', locationId: '', lowStockThreshold: 10, attributes: [] }
// NEW: currency defaults to KHR for every new variant
const EMPTY_VARIANT  = { brand: '', unit: '', unitValue: 1, price: '', costPrice: '', currency: 'KHR', stock: 0, unitTypeId: '', pricingTiers: [] }

// Format a price using the variant's OWN currency, not the global formatter
const fmtVariantPrice = (price, currency) => {
  if (currency === 'USD') return '$' + Number(price || 0).toFixed(2)
  return formatCurrency(price) // existing ៛ formatter
}

export default function ProductList() {
  // ── Reference data ──
  const [categories,  setCategories]  = useState([])
  const [locations,   setLocations]   = useState([])
  const [unitTypes,   setUnitTypes]   = useState([])
  const [loadingRefs, setLoadingRefs] = useState(true)

  // ── Browse state ──
  const [browseMode,   setBrowseMode]   = useState('categories') // 'categories' | 'products' | 'search'
  const [selectedCat,  setSelectedCat]  = useState(null)
  const [search,       setSearch]       = useState('')
  const dSearch = useDebounce(search, 400)

  // ── Product list ──
  const [products,    setProducts]    = useState([])
  const [pagination,  setPagination]  = useState(null)
  const [page,        setPage]        = useState(1)
  const [loading,     setLoading]     = useState(false)

  // ── Modals ──
  const [showProduct,     setShowProduct]     = useState(false)
  const [showVariant,     setShowVariant]     = useState(false)
  const [showVariantList, setShowVariantList] = useState(false)
  const [editingProduct,  setEditingProduct]  = useState(null)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [editingVariant,  setEditingVariant]  = useState(null)
  const [variants,        setVariants]        = useState([])
  const [delConfirm,      setDelConfirm]      = useState(null)
  const [delVariantConfirm, setDelVariantConfirm] = useState(null) // double confirm for variant delete too
  const [saving,          setSaving]          = useState(false)

  const [productForm, setProductForm] = useState(EMPTY_PRODUCT)
  const [variantForm, setVariantForm] = useState(EMPTY_VARIANT)
  const [attrKey,     setAttrKey]     = useState('')
  const [attrVal,     setAttrVal]     = useState('')

  // ── Load reference data once ──
  useEffect(() => {
    setLoadingRefs(true)
    Promise.all([
      categoryAPI.list({ isActive: true }),
      locationAPI.list({ isActive: true }),
      unitTypeAPI.list(),
    ]).then(([c, l, u]) => {
      const cats  = Array.isArray(c.data) ? c.data : []; cats.sort((a,b) => a.name.localeCompare(b.name, 'km')); setCategories(cats)
      const locs  = Array.isArray(l.data) ? l.data : []; locs.sort((a,b) => a.name.localeCompare(b.name, 'km')); setLocations(locs)
      const units = Array.isArray(u.data) ? u.data : []; units.sort((a,b) => (a.displayName||a.name).localeCompare(b.displayName||b.name, 'km')); setUnitTypes(units)
    }).catch(() => {}).finally(() => setLoadingRefs(false))
  }, [])

  // ── Load products (category or search mode) ──
  const loadProducts = useCallback(async (catId, searchTerm, pg) => {
    setLoading(true)
    try {
      const params = { page: pg, limit: PAGE_SIZE }
      if (catId)      params.category = catId
      if (searchTerm) params.search   = searchTerm
      const res = await productAPI.list(params)
      setProducts(res.data?.products ?? [])
      setPagination(res.data?.pagination ?? null)
    } catch { setProducts([]) }
    finally { setLoading(false) }
  }, [])

  // ── Trigger on page change within category/search ──
  useEffect(() => {
    if (browseMode === 'products' && selectedCat) loadProducts(selectedCat._id, null, page)
  }, [page, browseMode, selectedCat, loadProducts])

  useEffect(() => {
    if (browseMode === 'search' && dSearch) loadProducts(null, dSearch, page)
  }, [page, browseMode, dSearch, loadProducts])

  // ── Search mode trigger ──
  useEffect(() => {
    if (dSearch) {
      setBrowseMode('search')
      setPage(1)
      loadProducts(null, dSearch, 1)
    } else if (browseMode === 'search') {
      setBrowseMode(selectedCat ? 'products' : 'categories')
      setProducts([])
    }
  }, [dSearch])

  const openCategory = (cat) => {
    setSelectedCat(cat)
    setBrowseMode('products')
    setPage(1)
    loadProducts(cat._id, null, 1)
  }

  const goBack = () => {
    if (browseMode === 'search') {
      setSearch(''); setProducts([]); setBrowseMode(selectedCat ? 'products' : 'categories')
    } else {
      setBrowseMode('categories'); setSelectedCat(null); setProducts([]); setPagination(null); setPage(1)
    }
  }

  const refreshProducts = () => {
    if (browseMode === 'products' && selectedCat) loadProducts(selectedCat._id, null, page)
    else if (browseMode === 'search' && dSearch)  loadProducts(null, dSearch, page)
  }

  // ── Product CRUD ──
  const openEditProduct = (p) => {
    setEditingProduct(p)
    setProductForm(p ? {
      name: p.name, description: p.description || '',
      categoryId: p.categoryId?._id || p.categoryId || '',
      locationId: p.locationId?._id || p.locationId || '',
      lowStockThreshold: p.lowStockThreshold, attributes: p.attributes || [],
    } : EMPTY_PRODUCT)
    setShowProduct(true)
  }

  const saveProduct = async () => {
    if (!productForm.name || !productForm.categoryId) { toast.error('សូមបំពេញឈ្មោះ និងប្រភេទ'); return }
    setSaving(true)
    try {
      if (editingProduct) {
        await productAPI.update(editingProduct._id, productForm)
        toast.success('កែប្រែដោយជោគជ័យ')
      } else {
        await productAPI.create(productForm)
        toast.success('បន្ថែមដោយជោគជ័យ')
      }
      setShowProduct(false); refreshProducts()
    } catch { } finally { setSaving(false) }
  }

  const deleteProduct = async () => {
    try {
      await productAPI.delete(delConfirm._id)
      toast.success('លុបដោយជោគជ័យ')
      setDelConfirm(null); refreshProducts()
    } catch { }
  }

  // ── Variant CRUD ──
  const openVariants = async (product) => {
    setSelectedProduct(product)
    try {
      const res = await variantAPI.listByProduct(product._id)
      setVariants(Array.isArray(res.data) ? res.data : [])
    } catch { setVariants([]) }
    setShowVariantList(true)
  }

  const refreshVariants = async (productId) => {
    try {
      const res = await variantAPI.listByProduct(productId)
      setVariants(Array.isArray(res.data) ? res.data : [])
    } catch { }
  }

  const openEditVariant = (v) => {
    setEditingVariant(v)
    setVariantForm(v ? {
      brand: v.brand || '', unit: v.unit, unitValue: v.unitValue, price: v.price,
      costPrice: v.costPrice || '',
      currency: v.currency || 'KHR', // NEW — defaults to KHR for legacy variants that predate this field
      stock: v.stock, unitTypeId: v.unitTypeId || '',
      pricingTiers: v.pricingTiers || [],
    } : EMPTY_VARIANT)
    setShowVariant(true)
  }

  const saveVariant = async () => {
    if (!variantForm.unit || !variantForm.price) { toast.error('សូមបំពេញព័ត៌មានចាំបាច់'); return }
    setSaving(true)
    try {
      const newStock = Number(variantForm.stock) || 0
      if (editingVariant) {
        await variantAPI.update(editingVariant._id, {
          brand: variantForm.brand, unit: variantForm.unit,
          unitValue: Number(variantForm.unitValue) || 1,
          price: Number(variantForm.price) || 0,
          costPrice: Number(variantForm.costPrice) || 0,
          currency: variantForm.currency, // NEW
          unitTypeId: variantForm.unitTypeId || undefined,
          pricingTiers: variantForm.pricingTiers,
        })
        const oldStock = Number(editingVariant.stock) || 0
        if (newStock !== oldStock) {
          await stockAPI.adjust({ variantId: editingVariant._id, type: 'adjust', quantity: newStock, reason: 'manual adjustment' })
        }
        toast.success('កែប្រែ Variant ដោយជោគជ័យ')
      } else {
        const res = await variantAPI.create({
          productId: selectedProduct._id, brand: variantForm.brand, unit: variantForm.unit,
          unitValue: Number(variantForm.unitValue) || 1, price: Number(variantForm.price) || 0,
          costPrice: Number(variantForm.costPrice) || 0,
          currency: variantForm.currency, // NEW
          unitTypeId: variantForm.unitTypeId || undefined, pricingTiers: variantForm.pricingTiers,
        })
        const createdId = res.data?._id
        if (createdId && newStock > 0) {
          await stockAPI.adjust({ variantId: createdId, type: 'in', quantity: newStock, reason: 'initial stock' })
        }
        toast.success('បន្ថែម Variant ដោយជោគជ័យ')
      }
      setShowVariant(false)
      await refreshVariants(selectedProduct._id)
    } catch (err) {
      toast.error(err?.response?.data?.message || 'មានបញ្ហា សូមព្យាយាមម្ដងទៀត')
    } finally { setSaving(false) }
  }

  const deleteVariant = async () => {
    try {
      await variantAPI.delete(delVariantConfirm._id)
      toast.success('លុបដោយជោគជ័យ')
      setDelVariantConfirm(null)
      await refreshVariants(selectedProduct._id)
    } catch { }
  }

  const selectedUnitType = unitTypes.find(u => u._id === variantForm.unitTypeId)

  // ── Breadcrumb ──
  const breadcrumb = browseMode === 'search'
    ? `លទ្ធផល: "${dSearch}"`
    : selectedCat?.name ?? ''

  return (
    <div className="space-y-4">
      <div className="card">

        {/* ── Toolbar ── */}
        <div className="flex flex-col sm:flex-row gap-3 p-4 border-b border-gray-100">
          <SearchBar value={search} onChange={v => { setSearch(v) }} placeholder="ស្វែងរកផលិតផល..." />
          <div className="flex-1" />
          <button onClick={() => openEditProduct(null)} className="btn-primary whitespace-nowrap">+ ផលិតផលថ្មី</button>
        </div>

        {/* ── Breadcrumb + back ── */}
        {browseMode !== 'categories' && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50">
            <button onClick={goBack} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded-lg px-3 py-1 bg-white">
              ← ត្រឡប់
            </button>
            <span className="text-xs text-gray-500">{breadcrumb}</span>
          </div>
        )}

        {/* ── Category Grid ── */}
        {browseMode === 'categories' && (
          <div className="p-4">
            {loadingRefs
              ? <PageLoader />
              : categories.length === 0
                ? <EmptyState title="គ្មានប្រភេទ" />
                : <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {categories.map(cat => (
                      <button key={cat._id} onClick={() => openCategory(cat)}
                        className="flex items-center gap-3 px-4 py-4 rounded-xl border-2 border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 text-left transition-all active:scale-95 group">
                        {/* Image placeholder — to be replaced with actual category image */}
                        <span className="text-2xl shrink-0">🗂️</span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 group-hover:text-indigo-700 truncate">{cat.name}</p>
                        </div>
                      </button>
                    ))}
                  </div>
            }
          </div>
        )}

        {/* ── Product Table (category or search mode) ── */}
        {(browseMode === 'products' || browseMode === 'search') && (
          <>
            {loading ? <PageLoader /> : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="table-header text-left">ឈ្មោះ</th>
                        <th className="table-header text-left">ប្រភេទ</th>
                        <th className="table-header text-left">ទីកន្លែង</th>
                        <th className="table-header text-left">គុណលក្ខណ</th>
                        <th className="table-header text-center">ស្ថានភាព</th>
                        <th className="table-header text-center">សកម្មភាព</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.length === 0 && (
                        <tr><td colSpan={6}><EmptyState title="គ្មានផលិតផល" message="ចុច '+ ផលិតផលថ្មី' ដើម្បីបន្ថែម" /></td></tr>
                      )}
                      {products.map(p => (
                        <tr key={p._id} className="hover:bg-gray-50 transition-colors">
                          <td className="table-cell">
                            <p className="font-medium text-gray-800">{p.name}</p>
                            {p.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{p.description}</p>}
                          </td>
                          <td className="table-cell"><span className="badge-blue">{p.categoryId?.name || '-'}</span></td>
                          <td className="table-cell text-gray-500">{p.locationId?.name || '-'}</td>
                          <td className="table-cell">
                            <div className="flex flex-wrap gap-1">
                              {(p.attributes || []).slice(0, 2).map((a, i) => (
                                <span key={i} className="badge-gray text-xs">{a.name}: {a.value}</span>
                              ))}
                            </div>
                          </td>
                          <td className="table-cell text-center">
                            <span className={p.isActive ? 'badge-green' : 'badge-red'}>{p.isActive ? 'សកម្ម' : 'អសកម្ម'}</span>
                          </td>
                          <td className="table-cell text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => openVariants(p)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-xs transition-colors">📦 Variant</button>
                              <button onClick={() => openEditProduct(p)} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">✏️</button>
                              <button onClick={() => setDelConfirm(p)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors">🗑️</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination pagination={pagination} onChange={p => { setPage(p) }} />
              </>
            )}
          </>
        )}
      </div>

      {/* ── Product Modal ── */}
      <Modal open={showProduct} onClose={() => setShowProduct(false)} title={editingProduct ? 'កែប្រែផលិតផល' : 'ផលិតផលថ្មី'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="ឈ្មោះផលិតផល" required className="col-span-2">
              <input className="input-field" value={productForm.name} onChange={e => setProductForm(p => ({...p, name: e.target.value}))} placeholder="ឧ: ដែក, ស៊ីម៉ង់..." />
            </FormField>
            <FormField label="ប្រភេទ" required>
              <select className="input-field" value={productForm.categoryId} onChange={e => setProductForm(p => ({...p, categoryId: e.target.value}))}>
                <option value="">-- ជ្រើសប្រភេទ --</option>
                {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </FormField>
            <FormField label="ទីកន្លែង">
              <select className="input-field" value={productForm.locationId} onChange={e => setProductForm(p => ({...p, locationId: e.target.value}))}>
                <option value="">-- ជ្រើសទីកន្លែង --</option>
                {locations.map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
              </select>
            </FormField>
            <FormField label="ការពណ៌នា" className="col-span-2">
              <textarea className="input-field" rows={2} value={productForm.description} onChange={e => setProductForm(p => ({...p, description: e.target.value}))} />
            </FormField>
            <FormField label="ដែនកំណត់ស្ទុំទាប">
              <input type="number" min="0" className="input-field" value={productForm.lowStockThreshold} onChange={e => setProductForm(p => ({...p, lowStockThreshold: +e.target.value}))} />
            </FormField>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">គុណលក្ខណ (Attributes)</p>
            <div className="space-y-2">
              {productForm.attributes.map((a, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-600">{a.name}: <strong>{a.value}</strong></span>
                  <button onClick={() => setProductForm(p => ({...p, attributes: p.attributes.filter((_,j) => j!==i)}))} className="ml-auto text-red-500 hover:text-red-700">✕</button>
                </div>
              ))}
              <div className="flex gap-2">
                <input value={attrKey} onChange={e => setAttrKey(e.target.value)} placeholder="គុណ (ឧ: ក្រាស)" className="input-field flex-1 text-sm" />
                <input value={attrVal} onChange={e => setAttrVal(e.target.value)} placeholder="តម្លៃ (ឧ: 2mm)" className="input-field flex-1 text-sm" />
                <button onClick={() => { if(attrKey && attrVal){ setProductForm(p=>({...p, attributes:[...p.attributes,{name:attrKey,value:attrVal}]})); setAttrKey(''); setAttrVal('') }}} className="btn-secondary text-sm px-3">+</button>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button onClick={() => setShowProduct(false)} className="btn-secondary">បោះបង់</button>
            <button onClick={saveProduct} disabled={saving} className="btn-primary">{saving ? 'កំពុងរក្សា...' : 'រក្សាទុក'}</button>
          </div>
        </div>
      </Modal>

      {/* ── Variant List Modal ── */}
      <Modal open={showVariantList} onClose={() => setShowVariantList(false)} title={`Variants — ${selectedProduct?.name}`} size="xl">
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => openEditVariant(null)} className="btn-primary text-sm">+ Variant ថ្មី</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-header text-left">SKU</th>
                  <th className="table-header text-left">ម៉ាក</th>
                  <th className="table-header text-left">ឯកតា</th>
                  {/* NEW column — shows which currency this variant's prices use */}
                  <th className="table-header text-center">រូបិយប័ណ្ណ</th>
                  <th className="table-header text-right">តម្លៃ</th>
                  <th className="table-header text-right">ថ្លៃទុន</th>
                  <th className="table-header text-right">ស្ទុំ</th>
                  <th className="table-header text-center">សកម្មភាព</th>
                </tr>
              </thead>
              <tbody>
                {variants.length === 0 && (
                  <tr><td colSpan={8}><EmptyState title="គ្មាន Variant" /></td></tr>
                )}
                {variants.map(v => {
                  const vCurrency = v.currency || 'KHR'
                  return (
                    <tr key={v._id} className="hover:bg-gray-50">
                      <td className="table-cell font-mono text-xs">{v.sku}</td>
                      <td className="table-cell">{v.brand || '-'}</td>
                      <td className="table-cell">{v.unitValue} {v.unit}</td>
                      <td className="table-cell text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${vCurrency === 'USD' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                          {vCurrency === 'USD' ? '$ USD' : '៛ KHR'}
                        </span>
                      </td>
                      <td className="table-cell text-right font-semibold text-green-600">{fmtVariantPrice(v.price, vCurrency)}</td>
                      <td className="table-cell text-right text-gray-400">{fmtVariantPrice(v.costPrice, vCurrency)}</td>
                      <td className="table-cell text-right">
                        <span className={v.stock <= 5 ? 'badge-red' : v.stock <= 20 ? 'badge-yellow' : 'badge-green'}>{v.stock}</span>
                      </td>
                      <td className="table-cell text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openEditVariant(v)} className="p-1 text-gray-500 hover:bg-gray-100 rounded">✏️</button>
                          <button onClick={() => setDelVariantConfirm(v)} className="p-1 text-red-500 hover:bg-red-50 rounded">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* ── Variant Form Modal ── */}
      <Modal open={showVariant} onClose={() => setShowVariant(false)} title={editingVariant ? 'កែប្រែ Variant' : 'Variant ថ្មី'} size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="ប្រភេទឯកតា">
              <select className="input-field" value={variantForm.unitTypeId} onChange={e => setVariantForm(p=>({...p, unitTypeId: e.target.value, unit: ''}))}>
                <option value="">-- ជ្រើស --</option>
                {unitTypes.map(u => <option key={u._id} value={u._id}>{u.displayName || u.name}</option>)}
              </select>
            </FormField>
            <FormField label="ឯកតាវាស់" required>
              {selectedUnitType ? (
                <select className="input-field" value={variantForm.unit} onChange={e => setVariantForm(p=>({...p, unit: e.target.value}))}>
                  <option value="">-- ជ្រើស --</option>
                  {selectedUnitType.measurements.map(m => <option key={m.symbol} value={m.symbol}>{m.label} ({m.symbol})</option>)}
                </select>
              ) : (
                <input className="input-field" value={variantForm.unit} onChange={e => setVariantForm(p=>({...p, unit: e.target.value}))} placeholder="ឧ: kg, ដប, ប្រអប់..." />
              )}
            </FormField>
            <FormField label="បរិមាណ" required>
              <input type="number" min="0.001" step="0.001" className="input-field" value={variantForm.unitValue} onChange={e => setVariantForm(p=>({...p, unitValue: +e.target.value}))} />
            </FormField>
            <FormField label="ម៉ាក">
              <input className="input-field" value={variantForm.brand} onChange={e => setVariantForm(p=>({...p, brand: e.target.value}))} placeholder="ម៉ាក..." />
            </FormField>

            {/* ══════════════════════════════════════════════
                CURRENCY SELECTOR — one per variant.
                All pricing tiers (retail/wholesale/vip/bulk) for THIS
                variant share this currency. A different variant of the
                same product can use a different currency.
            ══════════════════════════════════════════════ */}
            <FormField label="រូបិយប័ណ្ណ" required className="col-span-2">
              <div className="flex gap-2">
                {[['KHR', '៛ រៀល (KHR)'], ['USD', '$ ដុល្លារ (USD)']].map(([val, label]) => (
                  <button key={val} type="button"
                    onClick={() => setVariantForm(p => ({...p, currency: val}))}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${variantForm.currency === val ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">តម្លៃលក់ ថ្លៃទុន និងថ្លៃតាមចំណាត់ទាំងអស់ខាងក្រោម នឹងគណនាជារូបិយប័ណ្ណនេះ</p>
            </FormField>

            <FormField label={`តម្លៃលក់ (${variantForm.currency === 'USD' ? 'USD $' : 'រៀល ៛'})`} required>
              <div className="relative">
                <input type="number" min="0" className="input-field pr-8" value={variantForm.price} onChange={e => setVariantForm(p=>({...p, price: +e.target.value}))} placeholder="0" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">{variantForm.currency === 'USD' ? '$' : '៛'}</span>
              </div>
            </FormField>
            <FormField label={`ថ្លៃទុន (${variantForm.currency === 'USD' ? 'USD $' : 'រៀល ៛'})`}>
              <div className="relative">
                <input type="number" min="0" className="input-field pr-8" value={variantForm.costPrice} onChange={e => setVariantForm(p=>({...p, costPrice: +e.target.value}))} placeholder="0" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">{variantForm.currency === 'USD' ? '$' : '៛'}</span>
              </div>
            </FormField>
            <FormField label={editingVariant ? 'ស្ទុំ (កំណត់ផ្ទាល់)' : 'ស្ទុំដើម'}>
              <input type="number" min="0" className="input-field" value={variantForm.stock}
                onChange={e => setVariantForm(p=>({...p, stock: e.target.value === '' ? '' : Number(e.target.value) }))} />
            </FormField>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">
              ថ្លៃតាមចំណាត់ (Pricing Tiers) — {variantForm.currency === 'USD' ? '$' : '៛'}
            </p>
            <div className="space-y-2">
              {variantForm.pricingTiers.map((t, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2 text-sm">
                  <select value={t.type} onChange={e => { const tiers=[...variantForm.pricingTiers]; tiers[i].type=e.target.value; setVariantForm(p=>({...p,pricingTiers:tiers})) }} className="input-field text-xs w-28">
                    <option value="retail">រាយ</option>
                    <option value="wholesale">លក់ដុំ</option>
                    <option value="vip">VIP</option>
                    <option value="bulk">Bulk</option>
                  </select>
                  <input type="number" value={t.price} onChange={e => { const tiers=[...variantForm.pricingTiers]; tiers[i].price=+e.target.value; setVariantForm(p=>({...p,pricingTiers:tiers})) }} className="input-field text-xs w-28" placeholder={`ថ្លៃ (${variantForm.currency === 'USD' ? '$' : '៛'})`} />
                  <input type="number" value={t.minQty} onChange={e => { const tiers=[...variantForm.pricingTiers]; tiers[i].minQty=+e.target.value; setVariantForm(p=>({...p,pricingTiers:tiers})) }} className="input-field text-xs w-20" placeholder="ចំនួនអប្បបរមា" />
                  <button onClick={() => setVariantForm(p=>({...p,pricingTiers:p.pricingTiers.filter((_,j)=>j!==i)}))} className="text-red-500">✕</button>
                </div>
              ))}
              <button onClick={() => setVariantForm(p=>({...p,pricingTiers:[...p.pricingTiers,{type:'wholesale',price:0,minQty:10}]}))} className="btn-secondary text-xs py-1.5">
                + Tier ថ្មី
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button onClick={() => setShowVariant(false)} className="btn-secondary">បោះបង់</button>
            <button onClick={saveVariant} disabled={saving} className="btn-primary">{saving ? 'កំពុងរក្សា...' : 'រក្សាទុក'}</button>
          </div>
        </div>
      </Modal>

      {/* ── Confirm delete product ── */}
      <ConfirmDialog
        open={!!delConfirm} onClose={() => setDelConfirm(null)} onConfirm={deleteProduct}
        title="⚠️ លុបផលិតផល" message={`តើអ្នកចង់លុប "${delConfirm?.name}" ពិតមែនទេ? សកម្មភាពនេះមិនអាចត្រឡប់វិញបានទេ។`}
      />

      {/* ── Confirm delete variant (also a dangerous, irreversible action) ── */}
      <ConfirmDialog
        open={!!delVariantConfirm} onClose={() => setDelVariantConfirm(null)} onConfirm={deleteVariant}
        title="⚠️ លុប Variant" message={`តើអ្នកចង់លុប Variant "${delVariantConfirm?.sku}" ពិតមែនទេ? ស្ទុំ និងប្រវត្តិតម្លៃទាំងអស់នឹងត្រូវបាត់បង់។`}
      />
    </div>
  )
}