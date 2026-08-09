import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { invoiceAPI, productAPI, variantAPI, categoryAPI, settingAPI } from '../../api/index.js'
import { useDebounce } from '../../hooks/useDebounce.js'
import { SearchBar, FormField, PageLoader } from '../../components/UI/index.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import { sendOrderToTelegram } from '../../utils/telegram.js'

const TIER_LABELS = { retail:'រាយ', wholesale:'លក់ដុំ', vip:'VIP', bulk:'ដុំ', custom:'ផ្ទាល់ខ្លួន' }
const TIER_COLORS  = { retail:'bg-blue-100 text-blue-700', wholesale:'bg-orange-100 text-orange-700', vip:'bg-purple-100 text-purple-700', bulk:'bg-green-100 text-green-700', custom:'bg-gray-100 text-gray-600' }
const ROWS_PER_PAGE = 15
const PAGE_SIZE = 20

// ── Currency formatting helpers ──
const fmtKHR = (n) => Math.round(n || 0).toLocaleString('km-KH') + ' ៛'
const fmtUSD = (n) => '$' + (n || 0).toFixed(2)

export default function InvoiceEdit() {
  const { id }   = useParams()
  const navigate = useNavigate()

  const [invoice,      setInvoice]      = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [submitting,   setSubmitting]   = useState(false)

  const [note,          setNote]         = useState('')
  const [discountType,  setDiscountType] = useState('none')
  const [discountValue, setDiscountValue]= useState('')

  // ── Payment mode — 3 explicit states, same semantics as InvoiceCreate ──
  //   'paid'    → fully paid, no deposit input
  //   'deposit' → partial, shows deposit input + currency picker + cascade
  //   'pending' → not paid, remaining = full total
  const [paymentMode,     setPaymentMode]     = useState('paid')
  const [deposit,          setDeposit]         = useState('')
  const [depositCurrency,  setDepositCurrency] = useState('KHR')

  // ── Display currency combo box: 'KHR' | 'USD' | 'BOTH' — same as InvoiceCreate ──
  const [displayCurrency, setDisplayCurrency] = useState('KHR')

  // ── Two independent exchange rates, loaded from Settings ──
  const [usdToKhr,    setUsdToKhr]    = useState(4100)
  const [khrToUsd,    setKhrToUsd]    = useState(4100)
  const [loadingRate, setLoadingRate] = useState(true)

  const [cart, setCart] = useState([])

  // ── Category / product browsing state (ported from InvoiceCreate) ──
  const [search,        setSearch]        = useState('')
  const [browseMode,    setBrowseMode]    = useState('categories') // categories | products | search
  const [categories,    setCategories]    = useState([])
  const [loadingCats,   setLoadingCats]   = useState(true)
  const [selectedCat,   setSelectedCat]   = useState(null)
  const [catProducts,   setCatProducts]   = useState([])
  const [catPage,       setCatPage]       = useState(1)
  const [catHasMore,    setCatHasMore]    = useState(false)
  const [loadingProds,  setLoadingProds]  = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [selectedProd,  setSelectedProd]  = useState(null)
  const [variants,      setVariants]      = useState([])
  const [loadingVars,   setLoadingVars]   = useState(false)

  // ── Custom item ──
  const [customName,     setCustomName]     = useState('')
  const [customPrice,    setCustomPrice]    = useState('')
  const [customCurrency, setCustomCurrency] = useState('KHR')
  const [customQty,      setCustomQty]      = useState(1)

  // ── Double confirm before saving (dangerous — changes invoice) ──
  const [saveConfirm, setSaveConfirm] = useState(null) // { andSendTelegram: bool }

  const dSearch = useDebounce(search, 400)

  // ── In-session caches, same pattern as InvoiceCreate ──
  const catProductsCacheRef = useRef(new Map())
  const variantsCacheRef    = useRef(new Map())
  const browseCardRef       = useRef(null)

  // ── Load the invoice, categories, and exchange rates ──
  useEffect(() => {
    invoiceAPI.get(id).then(r => {
      const inv = r.data
      setInvoice(inv)
      setNote(inv.note || '')
      setDiscountType(inv.discountType || 'none')
      setDiscountValue(inv.discountValue ? String(inv.discountValue) : '')
      setDisplayCurrency(inv.currency || 'KHR')
      setDepositCurrency(inv.depositCurrency || inv.currency || 'KHR')
      setDeposit(inv.depositAmount ? String(inv.depositAmount) : '')

      // Map stored status → 3-way paymentMode
      setPaymentMode(inv.status === 'pending' ? 'pending' : inv.status === 'partial' ? 'deposit' : 'paid')

      setCart((inv.items || []).map(item => {
        // item.variantId may come back populated with productId depending on
        // the backend's .populate() — fall back gracefully if it's just an id.
        const populatedVariant = item.variantId && typeof item.variantId === 'object' ? item.variantId : null
        const productIdRaw = populatedVariant?.productId
        const productId = productIdRaw && typeof productIdRaw === 'object' ? productIdRaw._id : productIdRaw || null
        return {
          isCustom:      item.isCustom || false,
          variantId:     populatedVariant?._id || item.variantId || null,
          productId,
          productLabel:  item.productName,
          variantOptions: [], // lazily filled via ensureVariantOptions()
          sku:           item.sku || populatedVariant?.sku || '',
          productName:   item.productName,
          brand:         item.brand || populatedVariant?.brand || '',
          unit:          item.unit || populatedVariant?.unit || '',
          unitValue:     item.unitValue || populatedVariant?.unitValue || '',
          stock:         populatedVariant?.stock ?? Infinity,
          qty:           item.quantity,
          unitPrice:     item.unitPrice,
          priceType:     'custom',
          subtotal:      item.subtotal ?? (item.quantity * item.unitPrice),
          tiers:         [],
          // BOTH-mode invoices store per-item currency; single-currency
          // invoices assume every item is priced in the invoice currency.
          variantCurrency: item.currency || inv.currency || 'KHR',
        }
      }))
    }).catch(() => toast.error('រកមិនឃើញ')).finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    setLoadingCats(true)
    categoryAPI.list({ limit: 100 })
      .then(r => {
        const cats = Array.isArray(r.data) ? r.data : (r.data?.categories ?? [])
        cats.sort((a, b) => a.name.localeCompare(b.name, 'km'))
        setCategories(cats)
      })
      .catch(() => setCategories([]))
      .finally(() => setLoadingCats(false))

    setLoadingRate(true)
    settingAPI.getExchangeRate()
      .then(r => {
        setUsdToKhr(r.data?.usdToKhr ?? 4100)
        setKhrToUsd(r.data?.khrToUsd ?? 4100)
      })
      .catch(() => toast.error('មិនអាចទាញអត្រាប្ដូររូបិយប័ណ្ណបាន — ប្រើតម្លៃលំនាំដើម'))
      .finally(() => setLoadingRate(false))
  }, [])

  // ── Search — scoped to the selected category when browsing inside one ──
  useEffect(() => {
    if (!dSearch) { setSearchResults([]); return }
    setSelectedProd(null); setVariants([])
    setLoadingSearch(true)
    const params = selectedCat
      ? { search: dSearch, category: selectedCat._id, limit: 30 }
      : { search: dSearch, limit: 30 }
    if (!selectedCat) setBrowseMode('search')
    productAPI.list(params)
      .then(r => setSearchResults(r.data?.products ?? []))
      .catch(() => setSearchResults([]))
      .finally(() => setLoadingSearch(false))
  }, [dSearch, selectedCat])

  const openCategory = useCallback(async (cat) => {
    setSelectedCat(cat); setSelectedProd(null); setVariants([])
    setSearch(''); setSearchResults([])
    setBrowseMode('products')

    const cached = catProductsCacheRef.current.get(cat._id)
    if (cached) {
      setCatProducts(cached.products); setCatPage(cached.page); setCatHasMore(cached.hasMore)
      return
    }

    setCatProducts([]); setCatPage(1); setCatHasMore(false); setLoadingProds(true)
    try {
      const r = await productAPI.list({ category: cat._id, limit: PAGE_SIZE, page: 1 })
      const list = r.data?.products ?? []
      const hasMore = list.length === PAGE_SIZE
      setCatProducts(list); setCatHasMore(hasMore)
      catProductsCacheRef.current.set(cat._id, { products: list, page: 1, hasMore })
    } catch { toast.error('មិនអាចទាញផលិតផលបាន') }
    finally { setLoadingProds(false) }
  }, [])

  const loadMoreProducts = async () => {
    const nextPage = catPage + 1; setLoadingProds(true)
    try {
      const r = await productAPI.list({ category: selectedCat._id, limit: PAGE_SIZE, page: nextPage })
      const list = r.data?.products ?? []
      const merged = [...catProducts, ...list]
      const hasMore = list.length === PAGE_SIZE
      setCatProducts(merged); setCatPage(nextPage); setCatHasMore(hasMore)
      catProductsCacheRef.current.set(selectedCat._id, { products: merged, page: nextPage, hasMore })
    } catch { toast.error('មិនអាចទាញបន្ថែម') }
    finally { setLoadingProds(false) }
  }

  const fetchVariantsForProduct = async (productId) => {
    const cached = variantsCacheRef.current.get(productId)
    if (cached) return cached
    const res = await variantAPI.listByProduct(productId)
    const list = Array.isArray(res.data) ? res.data : []
    variantsCacheRef.current.set(productId, list)
    return list
  }

  const selectProduct = async (p) => {
    setSelectedProd(p); setVariants([]); setLoadingVars(true)
    try {
      const list = await fetchVariantsForProduct(p._id)
      setVariants(list)
    } catch { toast.error('មិនអាចទាញ Variant បាន') }
    finally { setLoadingVars(false) }
  }

  const goBack = () => {
    if (selectedProd) { setSelectedProd(null); setVariants([]) }
    else if (browseMode === 'products') {
      setBrowseMode('categories'); setSelectedCat(null); setCatProducts([])
      setSearch(''); setSearchResults([])
    }
    else if (browseMode === 'search') { setSearch(''); setSearchResults([]); setBrowseMode('categories') }
  }

  const getTiers = (variant) => {
    const tiers = []
    if (variant.pricingTiers?.length > 0) {
      const seen = new Set()
      variant.pricingTiers.forEach(t => {
        const key = `${t.type}-${t.minQty}`
        if (!seen.has(key)) {
          seen.add(key)
          tiers.push({ label:`${TIER_LABELS[t.type]??t.type}${t.minQty>1?` (≥${t.minQty})`:''}`, type:t.type, price:t.price })
        }
      })
    }
    if (tiers.length === 0) tiers.push({ label:'រាយ', type:'retail', price:variant.price??0 })
    return tiers
  }

  // ── Conversion helper — same directional rates as InvoiceCreate ──
  const toDisplay = useCallback((amount, fromCurrency, toCurrency) => {
    if (!fromCurrency || fromCurrency === toCurrency) return amount
    if (fromCurrency === 'USD' && toCurrency === 'KHR') return amount * usdToKhr
    if (fromCurrency === 'KHR' && toCurrency === 'USD') return amount / khrToUsd
    return amount
  }, [usdToKhr, khrToUsd])

  // ── Add a DB variant to the cart (new line, or +1 if already present) ──
  const addVariantToCart = (variant) => {
    const variantCurrency = variant.currency || 'KHR'
    const existing = cart.findIndex(c => !c.isCustom && c.variantId === variant._id)
    if (existing >= 0) {
      setCart(prev => prev.map((c,i) => i===existing ? {...c, qty:c.qty+1, subtotal:(c.qty+1)*c.unitPrice} : c))
      toast.success(`+1 → ${variant.unitValue}${variant.unit}`); return
    }
    const tiers = getTiers(variant)
    const defaultTier = tiers[0]
    setCart(prev => [...prev, {
      isCustom: false,
      variantId: variant._id, sku: variant.sku, productName: selectedProd?.name ?? '',
      productLabel: selectedProd?.name ?? '',
      productId: selectedProd?._id ?? null, variantOptions: variants,
      brand: variant.brand ?? '', unit: variant.unit, unitValue: variant.unitValue,
      stock: variant.stock, qty: 1, unitPrice: defaultTier.price, priceType: defaultTier.type,
      subtotal: defaultTier.price, tiers,
      variantCurrency,
    }])
    toast.success(`បន្ថែម: ${selectedProd?.name} – ${variant.unitValue}${variant.unit}`)
  }

  const addCustomToCart = () => {
    const name  = customName.trim()
    const price = Number(customPrice)
    const qty   = Math.max(1, Number(customQty) || 1)
    if (!name)  { toast.error('សូមបញ្ចូលឈ្មោះទំនិញ'); return }
    if (!price) { toast.error('សូមបញ្ចូលតម្លៃ'); return }
    setCart(prev => [...prev, {
      isCustom: true,
      productId: null, variantOptions: [],
      variantId: null, sku: '', productName: name,
      brand: '', unit: '', unitValue: '',
      stock: Infinity, qty, unitPrice: price, priceType: 'custom',
      subtotal: qty * price, tiers: [],
      variantCurrency: customCurrency,
    }])
    toast.success(`បន្ថែម: ${name}`)
    setCustomName(''); setCustomPrice(''); setCustomQty(1)
  }

  const setQty         = (idx,raw)  => { const qty=Math.max(1,Number(raw)||1); setCart(prev=>prev.map((c,i)=>i===idx?{...c,qty,subtotal:qty*c.unitPrice}:c)) }
  const applyTier      = (idx,tier) => setCart(prev=>prev.map((c,i)=>i===idx?{...c,unitPrice:tier.price,priceType:tier.type,subtotal:c.qty*tier.price}:c))
  const setPrice        = (idx,raw)  => { const unitPrice=Math.max(0,Number(raw)||0); setCart(prev=>prev.map((c,i)=>i===idx?{...c,unitPrice,priceType:'custom',subtotal:c.qty*unitPrice}:c)) }
  const setProductName  = (idx, name) => setCart(prev => prev.map((c,i) => i===idx ? { ...c, productName: name } : c))
  const removeItem      = (idx)      => setCart(prev => prev.filter((_,i) => i!==idx))

  // ── Switch a cart line to a sibling variant of the SAME product ──
  const switchVariant = (idx, newVariantId) => {
    setCart(prev => prev.map((c, i) => {
      if (i !== idx || c.isCustom) return c
      const newVariant = (c.variantOptions || []).find(v => v._id === newVariantId)
      if (!newVariant) return c
      const tiers = getTiers(newVariant)
      const keepTier = tiers.find(t => t.type === c.priceType) ?? tiers[0]
      return {
        ...c,
        variantId: newVariant._id,
        sku: newVariant.sku,
        brand: newVariant.brand ?? '',
        unit: newVariant.unit,
        unitValue: newVariant.unitValue,
        stock: newVariant.stock,
        variantCurrency: newVariant.currency || 'KHR',
        tiers,
        unitPrice: keepTier.price,
        priceType: keepTier.type,
        subtotal: c.qty * keepTier.price,
      }
    }))
  }

  // ── Make sure a cart line has its variantOptions/tiers loaded before we
  //     show the "ទំហំផ្សេង" / switch-variant controls for it — items that
  //     came from the original invoice don't have these until now. ──
  const ensureVariantOptions = async (idx) => {
    const item = cart[idx]
    if (item.isCustom || !item.productId || item.variantOptions?.length > 0) return item.variantOptions || []
    try {
      const list = await fetchVariantsForProduct(item.productId)
      setCart(prev => prev.map((c, i) => {
        if (i !== idx) return c
        const current = list.find(v => v._id === c.variantId)
        const tiers = current ? getTiers(current) : c.tiers
        return { ...c, variantOptions: list, tiers: tiers.length ? tiers : c.tiers }
      }))
      return list
    } catch {
      toast.error('មិនអាចទាញ Variant ផ្សេងទៀតបាន')
      return []
    }
  }

  // ── Jump to the product behind a cart line so a DIFFERENT variant can be
  //     added as a new, separate line (e.g. same item, another size) ──
  const goToProduct = async (idx) => {
    const item = cart[idx]
    if (item.isCustom || !item.productId) return
    const list = item.variantOptions?.length > 0 ? item.variantOptions : await ensureVariantOptions(idx)
    setSearch('')
    setSelectedProd({ _id: item.productId, name: item.productLabel || item.productName })
    setVariants(list)
    setBrowseMode('products')
    browseCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ── Does the cart mix currencies? ──
  const hasKHR = cart.some(c => (c.variantCurrency || 'KHR') === 'KHR')
  const hasUSD = cart.some(c => (c.variantCurrency || 'KHR') === 'USD')
  const isMixedCurrency = hasKHR && hasUSD

  // ── Native (un-converted) subtotals — used by BOTH mode ──
  const subtotalKhrNative = cart.filter(c => (c.variantCurrency || 'KHR') === 'KHR').reduce((s, c) => s + c.subtotal, 0)
  const subtotalUsdNative = cart.filter(c => (c.variantCurrency || 'KHR') === 'USD').reduce((s, c) => s + c.subtotal, 0)

  // ── Converted single-currency subtotal — used by KHR mode and USD mode ──
  const subtotalInDisplay = displayCurrency === 'BOTH'
    ? null
    : cart.reduce((s, c) => s + toDisplay(c.subtotal, c.variantCurrency || 'KHR', displayCurrency), 0)

  const discountAmt = displayCurrency === 'BOTH'
    ? 0
    : discountType==='percent' ? (subtotalInDisplay*(Number(discountValue)||0))/100
    : discountType==='fixed'  ? (Number(discountValue)||0) : 0
  const total = displayCurrency === 'BOTH' ? null : Math.max(0, subtotalInDisplay - discountAmt)

  const discountKhr = discountType==='percent' ? (subtotalKhrNative*(Number(discountValue)||0))/100
                     : discountType==='fixed'  ? Math.min(Number(discountValue)||0, subtotalKhrNative) : 0
  const discountUsd = discountType==='percent' ? (subtotalUsdNative*(Number(discountValue)||0))/100 : 0
  const totalKhrBoth = Math.max(0, subtotalKhrNative - discountKhr)
  const totalUsdBoth = Math.max(0, subtotalUsdNative - discountUsd)

  // ── Cascading deposit calculation — identical logic to InvoiceCreate ──
  const rawDepositInput = paymentMode === 'deposit' ? (Number(deposit) || 0) : 0

  let depositKhrApplied = 0
  let depositUsdApplied = 0
  let remainingKhrAfterDeposit = 0
  let remainingUsdAfterDeposit = 0

  if (displayCurrency === 'BOTH') {
    if (depositCurrency === 'USD') {
      const grandTotalInUSD = totalUsdBoth + (totalKhrBoth / khrToUsd)
      const capped = Math.min(rawDepositInput, grandTotalInUSD)
      depositUsdApplied = Math.min(capped, totalUsdBoth)
      remainingUsdAfterDeposit = Math.max(0, totalUsdBoth - depositUsdApplied)
      const leftoverUSD = capped - depositUsdApplied
      if (leftoverUSD > 0 && totalKhrBoth > 0) {
        const leftoverAsKHR = leftoverUSD * usdToKhr
        depositKhrApplied = Math.min(leftoverAsKHR, totalKhrBoth)
        remainingKhrAfterDeposit = Math.max(0, totalKhrBoth - depositKhrApplied)
      } else {
        remainingKhrAfterDeposit = totalKhrBoth
      }
    } else {
      const grandTotalInKHR = totalKhrBoth + (totalUsdBoth * usdToKhr)
      const capped = Math.min(rawDepositInput, grandTotalInKHR)
      depositKhrApplied = Math.min(capped, totalKhrBoth)
      remainingKhrAfterDeposit = Math.max(0, totalKhrBoth - depositKhrApplied)
      const leftoverKHR = capped - depositKhrApplied
      if (leftoverKHR > 0 && totalUsdBoth > 0) {
        const leftoverAsUSD = leftoverKHR / khrToUsd
        depositUsdApplied = Math.min(leftoverAsUSD, totalUsdBoth)
        remainingUsdAfterDeposit = Math.max(0, totalUsdBoth - depositUsdApplied)
      } else {
        remainingUsdAfterDeposit = totalUsdBoth
      }
    }
  } else {
    const convertedDeposit = depositCurrency === displayCurrency
      ? rawDepositInput
      : toDisplay(rawDepositInput, depositCurrency, displayCurrency)
    const applied = Math.min(convertedDeposit, total || 0)
    if (displayCurrency === 'USD') { depositUsdApplied = applied } else { depositKhrApplied = applied }
  }

  const remaining = displayCurrency === 'BOTH'
    ? null
    : Math.max(0, (total || 0) - (paymentMode === 'deposit' ? Math.min(displayCurrency === 'USD' ? depositUsdApplied : depositKhrApplied, total || 0) : 0))

  const fmtDisplay = (n) => displayCurrency === 'USD' ? fmtUSD(n) : fmtKHR(n)

  // Preview badge only — actual status is recomputed the same way on save
  const computedStatus = paymentMode === 'pending'
    ? 'pending'
    : paymentMode === 'paid'
      ? 'paid'
      : displayCurrency === 'BOTH'
        ? ((remainingKhrAfterDeposit === 0 && remainingUsdAfterDeposit === 0) ? 'paid' : (depositKhrApplied > 0 || depositUsdApplied > 0) ? 'partial' : 'pending')
        : (() => {
            const appliedAmt = displayCurrency === 'USD' ? depositUsdApplied : depositKhrApplied
            return appliedAmt > 0 && appliedAmt >= (total || 0) ? 'paid' : appliedAmt > 0 ? 'partial' : 'pending'
          })()

  const requestSave = (andSendTelegram) => {
    if (!cart.length) { toast.error('សូមបន្ថែមទំនិញ'); return }
    setSaveConfirm({ andSendTelegram })
  }

  const handleSave = async (andSendTelegram = false) => {
    setSaveConfirm(null)
    setSubmitting(true)
    try {
      const payload = {
        note, discountType,
        discountValue: Number(discountValue) || 0,
        depositInputAmount: paymentMode === 'deposit' ? rawDepositInput : 0,
        depositInputCurrency: (paymentMode === 'deposit' && rawDepositInput > 0) ? depositCurrency : null,
        status: computedStatus,
        currency: displayCurrency,
        usdToKhrRate: usdToKhr,
        khrToUsdRate: khrToUsd,
        items: cart.map(c => {
          const vCurrency = c.variantCurrency || 'KHR'
          const finalUnitPrice = displayCurrency === 'BOTH'
            ? c.unitPrice
            : toDisplay(c.unitPrice, vCurrency, displayCurrency)
          const base = {
            quantity: c.qty,
            unitPrice: finalUnitPrice,
            subtotal: c.qty * finalUnitPrice,
            isCustom: c.isCustom,
            ...(displayCurrency === 'BOTH' ? { currency: vCurrency } : {}),
          }
          return c.isCustom
            ? { ...base, variantId: null, productName: c.productName }
            : { ...base, variantId: c.variantId, productName: c.productName }
        }),
      }
      const res = await invoiceAPI.update(id, payload)
      const updated = res.data

      if (andSendTelegram) {
        const ok = await sendOrderToTelegram(updated || { ...invoice, ...payload }, 'កែប្រែ')
        if (ok) toast.success('📨 បានផ្ញើ Telegram!')
      }

      toast.success('កែប្រែវិក្កយបត្រដោយជោគជ័យ!')
      navigate(`/invoices/${id}`)
    } catch (err) {
      toast.error(err?.response?.data?.message || 'មានបញ្ហា')
    } finally { setSubmitting(false) }
  }

  if (loading) return <PageLoader />
  if (!invoice) return <div className="card p-8 text-center text-gray-400">រកមិនឃើញ</div>

  const cust = invoice.partnerName || invoice.customerName || ''

  const breadcrumb = selectedProd
    ? `${selectedCat?.name ?? ''} › ${selectedProd.name}`
    : selectedCat?.name ?? (browseMode==='search' ? `លទ្ធផល: "${dSearch}"` : null)

  const ProductGrid = ({ items, loadingItems }) => (
    loadingItems && items.length === 0
      ? <p className="text-center text-gray-400 py-10">កំពុងផ្ទុក...</p>
      : items.length === 0
        ? <div className="text-center py-12"><p className="text-5xl mb-3">📦</p><p className="text-sm text-gray-400">គ្មានផលិតផល</p></div>
        : <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {items.map(p => {
              const cartQtyForProduct = cart.reduce((s, c) => s + (!c.isCustom && c.productId === p._id ? c.qty : 0), 0)
              return (
                <button key={p._id} onClick={() => selectProduct(p)}
                  className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all active:scale-95 ${cartQtyForProduct > 0 ? 'border-indigo-400 bg-indigo-50/60' : 'border-gray-200 hover:border-indigo-400 hover:bg-indigo-50'}`}>
                  {cartQtyForProduct > 0 && (
                    <span className="absolute -top-2 -right-2 bg-indigo-600 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center shadow">
                      {cartQtyForProduct}
                    </span>
                  )}
                  <span className="text-2xl shrink-0">📦</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                    <p className="text-xs text-gray-400 truncate">{p.categoryId?.name ?? ''}</p>
                  </div>
                </button>
              )
            })}
          </div>
  )

  const VariantCard = (v) => {
    const tiers = getTiers(v)
    const vCurrency = v.currency || 'KHR'
    const cartIdx = cart.findIndex(c => !c.isCustom && c.variantId === v._id)
    const inCart = cartIdx >= 0
    const cartQty = inCart ? cart[cartIdx].qty : 0

    const decrementOrRemove = (e) => {
      e.stopPropagation()
      if (cartQty <= 1) removeItem(cartIdx)
      else setQty(cartIdx, cartQty - 1)
    }

    return (
      <div key={v._id} className="relative">
        {inCart && (
          <div className="absolute -top-2 -right-2 z-10 flex items-center gap-1">
            <span className="bg-indigo-600 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center shadow">
              {cartQty} ក្នុងកន្ត្រក
            </span>
            <button type="button" onClick={decrementOrRemove} title="ដកចេញពីកន្ត្រក"
              className="w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 text-white text-xs font-bold flex items-center justify-center shadow">
              −
            </button>
          </div>
        )}
        <button onClick={() => addVariantToCart(v)} disabled={v.stock <= 0}
          className={`w-full text-left p-4 rounded-xl border-2 bg-white transition-all ${
            inCart ? 'border-indigo-400 ring-2 ring-indigo-100' : v.stock>0?'border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 active:scale-95':'border-gray-100 opacity-40 cursor-not-allowed'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono text-gray-400">{v.sku}</span>
            <div className="flex items-center gap-1">
              <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${vCurrency === 'USD' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                {vCurrency === 'USD' ? '$' : '៛'}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${v.stock<=0?'bg-red-100 text-red-500':v.stock<=10?'bg-yellow-100 text-yellow-700':'bg-green-100 text-green-600'}`}>{v.stock} នៅ</span>
            </div>
          </div>
          <p className="text-sm font-bold text-gray-800">{v.unitValue} {v.unit}{v.brand?` · ${v.brand}`:''}</p>
          <div className="mt-2 space-y-1">
            {tiers.map((t,i) => (
              <div key={i} className="flex justify-between items-center">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${TIER_COLORS[t.type]??'bg-gray-100 text-gray-500'}`}>{t.label}</span>
                <span className="text-xs font-bold text-indigo-600">{vCurrency === 'USD' ? fmtUSD(t.price) : fmtKHR(t.price)}</span>
              </div>
            ))}
          </div>
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Link to={`/invoices/${id}`} className="btn-secondary text-sm">← ត្រឡប់</Link>
        <div>
          <h2 className="font-bold text-gray-800">✏️ កែប្រែវិក្កយបត្រ</h2>
          <p className="text-xs text-gray-400 font-mono">{invoice.invoiceNumber} · {cust}</p>
        </div>
      </div>

      <div className="flex gap-6 items-start">

        {/* LEFT */}
        <div className="flex-1 space-y-4 min-w-0">

          {/* CURRENCY COMBO BOX */}
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <h4 className="text-sm font-semibold text-gray-700">💱 រូបិយប័ណ្ណវិក្កយបត្រ</h4>
              {!loadingRate && (
                <span className="text-xs text-gray-400">
                  USD→៛: <strong className="text-gray-600">{usdToKhr.toLocaleString()}</strong>
                  <span className="mx-1">·</span>
                  ៛→USD: <strong className="text-gray-600">{khrToUsd.toLocaleString()}</strong>
                  <span className="ml-1 text-gray-300">(Settings)</span>
                </span>
              )}
            </div>

            <select value={displayCurrency} onChange={e => setDisplayCurrency(e.target.value)} className="input-field font-semibold">
              <option value="KHR">៛ រៀល (KHR) — បូកសរុបជារៀលទាំងអស់</option>
              <option value="USD">$ ដុល្លារ (USD) — បូកសរុបជាដុល្លារទាំងអស់</option>
              <option value="BOTH">៛ + $ បង្ហាញដាច់ពីគ្នា (មិនបម្លែង)</option>
            </select>

            {isMixedCurrency && displayCurrency !== 'BOTH' && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700 font-medium">
                ⚠️ មានទំនិញទាំង ៛ និង $ នៅក្នុងកន្ត្រក — ប្រព័ន្ធនឹងបម្លែងទាំងអស់ទៅជា{' '}
                <strong>{displayCurrency === 'USD' ? 'ដុល្លារ ($)' : 'រៀល (៛)'}</strong>{' '}
                ដោយប្រើអត្រា {displayCurrency === 'USD' ? `៛→USD = ${khrToUsd.toLocaleString()}` : `USD→៛ = ${usdToKhr.toLocaleString()}`}
              </div>
            )}
            {isMixedCurrency && displayCurrency === 'BOTH' && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-xs text-blue-700 font-medium">
                ℹ️ មិនបម្លែងទេ — ទំនិញ ៛ បូកគ្នាដាច់ដោយឡែក និងទំនិញ $ បូកគ្នាដាច់ដោយឡែក។
              </div>
            )}
          </div>

          {/* PRODUCT BROWSER — categories → products → variants, same as InvoiceCreate */}
          <div className="card p-5" ref={browseCardRef}>
            <h3 className="font-semibold text-gray-700 mb-3">🔍 បន្ថែមទំនិញ</h3>
            <SearchBar value={search} onChange={v => { setSearch(v); if (!v) { setBrowseMode(selectedCat ? 'products' : 'categories'); setSearchResults([]) } }}
              placeholder="ស្វែងរកឈ្មោះផលិតផល..."/>

            {(browseMode !== 'categories' || selectedProd) && (
              <div className="flex items-center gap-2 mt-3 mb-1">
                <button onClick={goBack} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded-lg px-3 py-1 bg-indigo-50">
                  ← ត្រឡប់
                </button>
                {breadcrumb && <span className="text-xs text-gray-500 truncate">{breadcrumb}</span>}
                {selectedCat && !selectedProd && dSearch && (
                  <span className="text-xs text-indigo-400">— ស្វែងរកក្នុងប្រភេទនេះ: "{dSearch}"</span>
                )}
              </div>
            )}

            <div className="mt-3">
              {selectedProd && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-3">📦 {selectedProd.name}</p>
                  {loadingVars
                    ? <p className="text-center text-gray-400 py-8">កំពុងទាញ...</p>
                    : variants.length === 0
                      ? <div className="text-center py-8 space-y-2"><p className="text-4xl">📭</p><p className="text-sm text-gray-500">ផលិតផលនេះគ្មាន Variant</p></div>
                      : <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{variants.map(v => VariantCard(v))}</div>
                  }
                </div>
              )}

              {!selectedProd && browseMode === 'search' && (
                <div>
                  <p className="text-xs text-gray-500 mb-3">លទ្ធផលស្វែងរក: <span className="font-semibold text-gray-700">"{dSearch}"</span></p>
                  <ProductGrid items={searchResults} loadingItems={loadingSearch} />
                </div>
              )}

              {!selectedProd && browseMode === 'products' && (
                <div>
                  <ProductGrid items={dSearch ? searchResults : catProducts} loadingItems={dSearch ? loadingSearch : loadingProds} />
                  {!dSearch && catHasMore && (
                    <div className="mt-4 text-center">
                      <button onClick={loadMoreProducts} disabled={loadingProds}
                        className="px-6 py-2 text-sm font-semibold text-indigo-600 border-2 border-indigo-200 rounded-xl hover:bg-indigo-50 disabled:opacity-50 transition-colors">
                        {loadingProds ? 'កំពុងផ្ទុក...' : '↓ បង្ហាញបន្ថែម'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {!selectedProd && browseMode === 'categories' && (
                <div>
                  {loadingCats
                    ? <p className="text-center text-gray-400 py-10">កំពុងផ្ទុកប្រភេទ...</p>
                    : categories.length === 0
                      ? <div className="text-center py-12"><p className="text-5xl mb-3">🗂️</p><p className="text-sm text-gray-400">គ្មានប្រភេទ</p></div>
                      : <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {categories.map(cat => (
                            <button key={cat._id} onClick={() => openCategory(cat)}
                              className="flex items-center gap-3 px-4 py-4 rounded-xl border-2 border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 text-left transition-all active:scale-95 group">
                              <span className="text-2xl shrink-0">🗂️</span>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-800 group-hover:text-indigo-700 truncate">{cat.name}</p>
                                {cat.productCount != null && <p className="text-xs text-gray-400">{cat.productCount} ផលិតផល</p>}
                              </div>
                            </button>
                          ))}
                        </div>
                  }
                </div>
              )}
            </div>
          </div>

          {/* CUSTOM ITEM */}
          <div className="card p-5">
            <div className="mb-4">
              <h3 className="font-semibold text-gray-700">✏️ បន្ថែមទំនិញផ្ទាល់ខ្លួន</h3>
              <p className="text-xs text-gray-400 mt-0.5">ទំនិញមិនមាននៅក្នុងប្រព័ន្ធ — វាយបញ្ចូលដោយខ្លួនឯង រួចចុចបន្ថែមទៅវិក្កយបត្រ</p>
            </div>
            <div className="flex gap-2 items-end flex-wrap">
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs font-medium text-gray-500 mb-1">ឈ្មោះទំនិញ</label>
                <input className="input-field text-sm" placeholder="ឈ្មោះទំនិញ..." value={customName}
                  onChange={e => setCustomName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustomToCart()} />
              </div>
              <div className="w-24">
                <label className="block text-xs font-medium text-gray-500 mb-1">រូបិយប័ណ្ណ</label>
                <select className="input-field text-sm" value={customCurrency} onChange={e => setCustomCurrency(e.target.value)}>
                  <option value="KHR">៛ KHR</option>
                  <option value="USD">$ USD</option>
                </select>
              </div>
              <div className="w-32">
                <label className="block text-xs font-medium text-gray-500 mb-1">តម្លៃ</label>
                <input type="number" min="0" className="input-field text-sm text-right" placeholder="0" value={customPrice}
                  onChange={e => setCustomPrice(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustomToCart()} />
              </div>
              <div className="w-20">
                <label className="block text-xs font-medium text-gray-500 mb-1">ចំនួន</label>
                <input type="number" min="1" className="input-field text-sm text-center" placeholder="1" value={customQty}
                  onChange={e => setCustomQty(Math.max(1, Number(e.target.value) || 1))} onKeyDown={e => e.key === 'Enter' && addCustomToCart()} />
              </div>
              <button onClick={addCustomToCart}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors shrink-0 h-[38px]">
                + បន្ថែម
              </button>
            </div>
          </div>

          <div className="card p-5 space-y-3">
            <h3 className="font-semibold text-gray-700">ចំណាំ & បញ្ចុះ</h3>
            <input value={note} onChange={e=>setNote(e.target.value)} placeholder="ចំណាំ..."
              className="w-full border-2 border-gray-200 rounded-xl text-sm px-3 py-2 focus:outline-none focus:border-indigo-400"/>
            <div className="flex gap-2">
              <select value={discountType} onChange={e=>{setDiscountType(e.target.value);setDiscountValue('')}}
                className="border-2 border-gray-200 rounded-xl text-sm px-3 py-2 focus:outline-none focus:border-indigo-400 w-32">
                <option value="none">គ្មានបញ្ចុះ</option>
                <option value="percent">% ភាគរយ</option>
                <option value="fixed">ចំនួនថេរ</option>
              </select>
              {discountType!=='none'&&(
                <input type="number" min="0" value={discountValue} onChange={e=>setDiscountValue(e.target.value)}
                  placeholder={discountType==='percent'?'10':'5000'}
                  className="flex-1 border-2 border-gray-200 rounded-xl text-sm px-3 py-2 focus:outline-none focus:border-indigo-400"/>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Cart */}
        <div className="w-[440px] shrink-0">
          <div className="card sticky top-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-800">🛒 ទំនិញ ({cart.length})</h3>
            </div>

            <div className="divide-y divide-gray-50 max-h-[500px] overflow-y-auto">
              {cart.length===0 ? (
                <div className="py-12 text-center text-gray-400"><p className="text-4xl mb-2">🛒</p><p className="text-sm">គ្មានទំនិញ</p></div>
              ) : cart.map((item,idx)=>{
                const vCurrency = item.variantCurrency || 'KHR'
                const shownSubtotal = displayCurrency === 'BOTH' ? item.subtotal : toDisplay(item.subtotal, vCurrency, displayCurrency)
                const shownCurrencyLabel = displayCurrency === 'BOTH' ? vCurrency : displayCurrency
                return (
                <div key={idx} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <input
                      value={item.productName}
                      onChange={e => setProductName(idx, e.target.value)}
                      className="font-bold text-gray-800 bg-transparent border-b border-dashed border-gray-300 focus:outline-none focus:border-indigo-400 flex-1 min-w-0 py-0.5"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      {!item.isCustom && item.productId && (
                        <button onClick={() => goToProduct(idx)} title="ទៅកាន់ផលិតផលនេះ — បន្ថែមទំហំ/ប្រភេទផ្សេងទៀត"
                          className="flex items-center gap-1 text-[11px] font-semibold text-indigo-500 hover:text-white hover:bg-indigo-500 border border-indigo-200 hover:border-indigo-500 rounded-lg px-2 py-1 transition-colors">
                          ↗ ទំហំផ្សេង
                        </button>
                      )}
                      <button onClick={()=>removeItem(idx)} className="text-red-400 hover:text-red-600 text-xl font-bold leading-none px-1">×</button>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {item.isCustom && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 font-semibold">ផ្ទាល់ខ្លួន</span>
                    )}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${vCurrency === 'USD' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                      {vCurrency === 'USD' ? '$' : '៛'}
                    </span>
                    {!item.isCustom && (
                      <span className="text-xs text-gray-400">
                        {item.unitValue}{item.unit}{item.brand?` · ${item.brand}`:''}
                        {item.sku && <span className="ml-1.5 font-mono text-gray-300">({item.sku})</span>}
                      </span>
                    )}
                  </div>

                  {/* Variant switch combo box — lazily loads options for
                      items that came straight from the original invoice */}
                  {!item.isCustom && item.productId && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-400 shrink-0">🔀 ប្តូរប្រភេទ:</span>
                      {item.variantOptions?.length > 0 ? (
                        <select
                          value={item.variantId}
                          onChange={e => switchVariant(idx, e.target.value)}
                          className="flex-1 min-w-0 text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:border-indigo-400"
                        >
                          {item.variantOptions.map(v => {
                            const vPrice = getTiers(v)[0]?.price ?? v.price ?? 0
                            return (
                              <option key={v._id} value={v._id}>
                                {v.unitValue}{v.unit}{v.brand?` · ${v.brand}`:''} — {(v.currency === 'USD' ? fmtUSD : fmtKHR)(vPrice)}
                              </option>
                            )
                          })}
                        </select>
                      ) : (
                        <button onClick={() => ensureVariantOptions(idx)}
                          className="flex-1 text-xs text-indigo-500 border border-indigo-200 rounded-lg px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-left">
                          ↻ ទាញយកប្រភេទផ្សេងទៀត
                        </button>
                      )}
                    </div>
                  )}

                  {!item.isCustom && item.tiers?.length > 1 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1.5 font-medium">ជ្រើសប្រភេទតម្លៃ:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {item.tiers.map((t, ti) => (
                          <button key={ti} onClick={() => applyTier(idx, t)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${item.priceType===t.type&&item.unitPrice===t.price?'bg-indigo-600 text-white border-indigo-600':'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'}`}>
                            {t.label} — {vCurrency === 'USD' ? fmtUSD(t.price) : fmtKHR(t.price)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-2.5">
                    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
                      <button onClick={()=>setQty(idx,item.qty-1)} className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 font-bold text-lg">−</button>
                      <input type="number" min="1" value={item.qty} onChange={e=>setQty(idx,e.target.value)} className="w-12 text-center text-sm font-semibold py-1 border-x border-gray-200 focus:outline-none"/>
                      <button onClick={()=>setQty(idx,item.qty+1)} className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 font-bold text-lg">+</button>
                    </div>
                    <span className="text-gray-400 font-bold">×</span>
                    <div className="flex-1 relative">
                      <input type="number" min="0" value={item.unitPrice} onChange={e=>setPrice(idx,e.target.value)}
                        className="w-full border-2 border-gray-200 rounded-lg text-sm text-right pr-6 pl-2 py-1.5 font-semibold focus:outline-none focus:border-indigo-400 bg-white"/>
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">{vCurrency === 'USD' ? '$' : '៛'}</span>
                    </div>
                    <span className="text-gray-400 font-bold">=</span>
                    <div className="text-right min-w-[90px]">
                      <p className="text-base font-bold text-green-600">
                        {shownCurrencyLabel === 'USD' ? fmtUSD(shownSubtotal) : fmtKHR(shownSubtotal)}
                      </p>
                      {displayCurrency !== 'BOTH' && vCurrency !== displayCurrency && (
                        <p className="text-[10px] text-gray-400">({vCurrency === 'USD' ? fmtUSD(item.subtotal) : fmtKHR(item.subtotal)})</p>
                      )}
                    </div>
                  </div>
                  {!item.isCustom && item.qty > item.stock && (
                    <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-1.5">⚠️ ស្ទុំមានតែ {item.stock}</p>
                  )}
                </div>
              )})}
            </div>

            <div className="p-5 border-t border-gray-100 space-y-4">
              {/* Totals — single currency mode */}
              {displayCurrency !== 'BOTH' && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-sm text-gray-600"><span>សរុបរង:</span><span className="font-semibold">{fmtDisplay(subtotalInDisplay)}</span></div>
                  {discountAmt>0&&<div className="flex justify-between text-sm text-red-500"><span>បញ្ចុះ:</span><span className="font-semibold">−{fmtDisplay(discountAmt)}</span></div>}
                  <div className="flex justify-between font-bold text-lg text-gray-800 pt-2 border-t border-gray-200"><span>សរុបទូទៅ:</span><span className="text-indigo-600">{fmtDisplay(total)}</span></div>
                </div>
              )}

              {/* Totals — BOTH mode */}
              {displayCurrency === 'BOTH' && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-100">
                      <p className="text-xs text-blue-500 mb-1">ទំនិញជា ៛ (មិនបម្លែង)</p>
                      <p className="font-bold text-blue-700">{fmtKHR(totalKhrBoth)}</p>
                      {discountKhr > 0 && <p className="text-[10px] text-blue-400 mt-0.5">បញ្ចុះ: −{fmtKHR(discountKhr)}</p>}
                    </div>
                    <div className="bg-green-50 rounded-lg p-3 text-center border border-green-100">
                      <p className="text-xs text-green-500 mb-1">ទំនិញជា $ (មិនបម្លែង)</p>
                      <p className="font-bold text-green-700">{fmtUSD(totalUsdBoth)}</p>
                      {discountUsd > 0 && <p className="text-[10px] text-green-400 mt-0.5">បញ្ចុះ: −{fmtUSD(discountUsd)}</p>}
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400 text-center">ទាំងពីរនេះមិនត្រូវបានបូកបញ្ចូលគ្នាទេ — នីមួយៗរក្សាទុកដាច់ដោយឡែកក្នុងវិក្កយបត្រតែមួយ</p>
                </div>
              )}

              {/* PAYMENT MODE — 3 explicit choices */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-600">💳 ស្ថានភាពការទូទាត់</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { mode: 'paid',    icon: '✅', label: 'បានទូទាត់ពេញ',  cls: 'border-green-400 bg-green-500 text-white' },
                    { mode: 'deposit', icon: '💰', label: 'កក់មុន',          cls: 'border-orange-400 bg-orange-500 text-white' },
                    { mode: 'pending', icon: '⏳', label: 'មិនទាន់ទូទាត់', cls: 'border-red-400 bg-red-500 text-white' },
                  ].map(({ mode, icon, label, cls }) => (
                    <button key={mode} type="button"
                      onClick={() => { setPaymentMode(mode); if (mode !== 'deposit') setDeposit('') }}
                      className={`py-3 rounded-xl text-xs font-bold border-2 transition-colors ${paymentMode === mode ? cls : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
                      <span className="block text-base mb-0.5">{icon}</span>
                      {label}
                    </button>
                  ))}
                </div>

                <div className={`rounded-xl px-3 py-2 text-xs font-medium ${
                  paymentMode === 'paid'    ? 'bg-green-50 text-green-700 border border-green-100'
                  : paymentMode === 'deposit' ? 'bg-orange-50 text-orange-700 border border-orange-100'
                  :                             'bg-red-50 text-red-600 border border-red-100'
                }`}>
                  {paymentMode === 'paid'    && 'អតិថិជនបានបង់ពេញ — វិក្កយបត្រនឹងកត់ជា «បានទូទាត់»'}
                  {paymentMode === 'deposit' && 'អតិថិជនបង់ប្រាក់កក់ — ការបោះពុម្ពនឹងបង្ហាញ «កក់មុន» និង «នៅខ្វះ»'}
                  {paymentMode === 'pending' && 'អតិថិជនមិនទាន់បង់ — «នៅខ្វះ» = សរុបទូទៅ'}
                </div>

                {paymentMode === 'deposit' && (
                  <div className="space-y-3 bg-orange-50 border border-orange-200 rounded-xl p-3">
                    <p className="text-xs font-semibold text-orange-700">អតិថិជនអាចបង់ជា ៛ ឬ $ — ប្រព័ន្ធគណនាបម្លែងស្វ័យប្រវត្តិ</p>
                    <div className="flex gap-2">
                      {[['KHR', '៛ រៀល'], ['USD', '$ ដុល្លារ']].map(([val, label]) => (
                        <button key={val} type="button" onClick={() => setDepositCurrency(val)}
                          className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${depositCurrency === val ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-orange-200 hover:bg-orange-50'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="relative">
                      <input type="number" min="0" step={depositCurrency === 'USD' ? '0.01' : '100'}
                        value={deposit} onChange={e => setDeposit(e.target.value)}
                        placeholder="ចំនួនប្រាក់កក់..."
                        className="w-full border-2 border-orange-200 rounded-xl text-sm px-3 pr-10 py-2.5 focus:outline-none focus:border-orange-400 bg-white font-semibold"/>
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-orange-400 pointer-events-none">
                        {depositCurrency === 'USD' ? '$' : '៛'}
                      </span>
                    </div>

                    {displayCurrency !== 'BOTH' && total > 0 && (
                      <div className="flex gap-2">
                        {[25, 50, 75].map(pct => {
                          const base = depositCurrency === displayCurrency
                            ? total * pct / 100
                            : toDisplay(total * pct / 100, displayCurrency, depositCurrency)
                          return (
                            <button key={pct} onClick={() => setDeposit(depositCurrency === 'USD' ? +base.toFixed(2) : Math.round(base))}
                              className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-white border-2 border-orange-200 text-orange-600 hover:bg-orange-100">{pct}%
                            </button>
                          )
                        })}
                        <button onClick={() => {
                          const full = depositCurrency === displayCurrency ? total : toDisplay(total, displayCurrency, depositCurrency)
                          setDeposit(depositCurrency === 'USD' ? +full.toFixed(2) : Math.round(full))
                        }} className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-orange-500 text-white hover:bg-orange-600">ពេញ</button>
                      </div>
                    )}

                    {rawDepositInput > 0 && (
                      <div className="space-y-2 pt-2 border-t border-orange-200">
                        {displayCurrency === 'BOTH' ? (
                          <>
                            <p className="text-[11px] text-gray-500 font-medium">លទ្ធផល (បង់ {depositCurrency === 'USD' ? fmtUSD(rawDepositInput) : fmtKHR(rawDepositInput)}):</p>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-white rounded-lg p-2 border border-orange-100 text-center">
                                <p className="text-[10px] text-gray-400">ផ្នែក ៛</p>
                                <p className="text-xs font-bold text-orange-600">−{fmtKHR(depositKhrApplied)}</p>
                                <p className="text-[10px] text-red-500">នៅខ្វះ {fmtKHR(remainingKhrAfterDeposit)}</p>
                              </div>
                              <div className="bg-white rounded-lg p-2 border border-orange-100 text-center">
                                <p className="text-[10px] text-gray-400">ផ្នែក $</p>
                                <p className="text-xs font-bold text-orange-600">−{fmtUSD(depositUsdApplied)}</p>
                                <p className="text-[10px] text-red-500">នៅខ្វះ {fmtUSD(remainingUsdAfterDeposit)}</p>
                              </div>
                            </div>
                            {((depositCurrency === 'USD' && depositKhrApplied > 0) || (depositCurrency === 'KHR' && depositUsdApplied > 0)) && (
                              <p className="text-[10px] text-amber-600 bg-amber-50 rounded-lg px-2 py-1.5">
                                ↪️ លុយសល់ក្រោយផ្នែក {depositCurrency === 'USD' ? '$' : '៛'} អស់ ត្រូវបានបម្លែងទៅបង់ផ្នែក {depositCurrency === 'USD' ? '៛' : '$'}
                              </p>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="flex justify-between text-sm">
                              <span className="text-orange-700 font-medium">💰 កក់:</span>
                              <span className="font-bold text-orange-700">{depositCurrency === 'USD' ? fmtUSD(rawDepositInput) : fmtKHR(rawDepositInput)}</span>
                            </div>
                            {depositCurrency !== displayCurrency && (
                              <p className="text-[10px] text-gray-400">
                                = {fmtDisplay(displayCurrency === 'USD' ? depositUsdApplied : depositKhrApplied)} (បម្លែង)
                              </p>
                            )}
                            <div className="flex justify-between text-sm">
                              <span className="text-red-600 font-medium">⏳ នៅខ្វះ:</span>
                              <span className="font-bold text-red-600">{fmtDisplay(remaining)}</span>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Status preview badge */}
              <div className="flex items-center justify-between px-3 py-2 bg-gray-100 rounded-xl">
                <span className="text-xs text-gray-500 font-medium">ស្ថានភាព​នឹងកត់:</span>
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                  computedStatus === 'pending'
                    ? 'bg-red-100 text-red-600'
                    : computedStatus === 'partial'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-green-100 text-green-700'
                }`}>
                  {computedStatus === 'pending'
                    ? '⏳ មិនទាន់ទូទាត់'
                    : computedStatus === 'partial'
                      ? '🕐 រងចាំ'
                      : '✅ បានទូទាត់ពេញ'}
                </span>
              </div>

              {/* Action buttons */}
              <div className="space-y-2">
                <button
                  onClick={() => requestSave(true)}
                  disabled={submitting || cart.length === 0}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold transition-colors">
                  {submitting ? 'កំពុងរក្សា...' : '💾 រក្សាទុក + 📨 ផ្ញើ Telegram'}
                </button>
                <button
                  onClick={() => requestSave(false)}
                  disabled={submitting || cart.length === 0}
                  className="w-full py-3 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 rounded-xl font-semibold transition-colors">
                  💾 រក្សាទុកតែ (មិនផ្ញើ Telegram)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Double confirm before saving ── */}
      <ConfirmDialog
        open={!!saveConfirm}
        onClose={() => setSaveConfirm(null)}
        onConfirm={() => handleSave(saveConfirm?.andSendTelegram)}
        title="⚠️ បញ្ជាក់ការកែប្រែវិក្កយបត្រ"
        message={`តើអ្នកប្រាកដចង់កែប្រែវិក្កយបត្រ ${invoice?.invoiceNumber}?\n\nស្ថានភាពថ្មី: ${
          computedStatus === 'pending' ? '⏳ មិនទាន់ទូទាត់'
          : computedStatus === 'partial' ? '🕐 រងចាំ'
          : '✅ បានទូទាត់ពេញ'
        }\n\nការផ្លាស់ប្ដូរនេះនឹងប៉ះពាល់ដល់ស្ទុំ និងប្រវត្តិហ្វីណង់។`}
      />
    </div>
  )
}