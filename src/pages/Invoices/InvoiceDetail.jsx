import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { invoiceAPI, productAPI, variantAPI, partnerAPI, categoryAPI, settingAPI } from '../../api/index.js'
import { useDebounce } from '../../hooks/useDebounce.js'
import { SearchBar, FormField } from '../../components/UI/index.jsx'
import { sendOrderToTelegram } from '../../utils/telegram.js'

const TIER_LABELS = { retail:'រាយ', wholesale:'លក់ដុំ', vip:'VIP', bulk:'ដុំ', custom:'ផ្ទាល់ខ្លួន' }
const TIER_COLORS  = { retail:'bg-blue-100 text-blue-700', wholesale:'bg-orange-100 text-orange-700', vip:'bg-purple-100 text-purple-700', bulk:'bg-green-100 text-green-700', custom:'bg-gray-100 text-gray-600' }
const ROWS_PER_PAGE = 15
const PAGE_SIZE = 20

// ── Currency formatting helpers ──
const fmtKHR = (n) => Math.round(n || 0).toLocaleString('km-KH') + ' ៛'
const fmtUSD = (n) => '$' + (n || 0).toFixed(2)

// ── Cash-rounding helper for KHR totals ──
// Looks at the hundreds digit (3rd digit from the right):
//   0       → round down to the even thousand (e.g. 47,050 → 47,000)
//   1 - 5   → round to the X,500 mark          (e.g. 47,250 → 47,500)
//   6 - 9   → round UP to the next thousand    (e.g. 47,650 → 48,000)
const roundToNearest500 = (n) => {
  const value = Math.round(n || 0)
  const base = Math.floor(value / 1000) * 1000
  const remainder = value - base
  const hundredsDigit = Math.floor(remainder / 100)
  if (hundredsDigit === 0) return base
  if (hundredsDigit <= 5) return base + 500
  return base + 1000
}

// ── ស័ង្កសី (corrugated zinc roofing sheet) products are sold by the meter.
//    When a variant belonging to one of these products is picked, instead of
//    adding straight to the cart we open a small "sheet builder" so the
//    person can enter the length (m), how many sheets at that length, and
//    the cut type. Repeated clicks of "add" accumulate multiple length
//    entries under ONE cart line for that variant — matching how these are
//    handed out/printed: several "length × qty type" rows under a single
//    product name, e.g.
//      ស័ង្កសី ក្រហម
//      2.3 × 5 ត្រង់
//      3 × 5 ត្រង់
// ──
const SHEET_TYPES = [
  { value: 'straight', label: 'ត្រង់' },
  { value: 'curved',   label: 'កោង'   },
  { value: 'flat',     label: 'លាត'   },
]

// ── Matches zinc-sheet product names regardless of spelling. Khmer for
//    "corrugated zinc sheet" gets written several different ways depending
//    on which connecting diacritic (or none at all) is used between ស and
//    ង — e.g. ស័ង្កសី (with MUSIKATOAN ័), ស្ង្កសី (with COENG ្), or
//    សង្ក្សី / សង្កសី (no mark between ស and ង at all). Rather than list
//    every spelling variant one by one (and inevitably miss the next one a
//    staff member types), strip the MUSIKATOAN (័, U+17C2) and COENG (្,
//    U+17D2) marks out of the name first — every known variant collapses
//    down to the same bare consonant skeleton "សងកសី" once those marks are
//    removed, so this catches existing AND future spelling variants alike
//    without needing to update this list again. ──
const isZincProduct = (name) => {
  if (!name) return false
  const stripped = name.replace(/[\u17C2\u17D2]/g, '')
  return stripped.includes('សងកសី')
}

// ── Only digits and a single decimal point — used for the ចោលចុង / កោង /
//    ប្រវែង text inputs so people can type floats reliably (some mobile
//    keyboards misbehave with <input type="number"> for decimals). Empty
//    string is allowed so the field can be cleared while typing. ──
const isValidDecimalInput = (v) => v === '' || /^\d*\.?\d*$/.test(v)

// ── Digits only (no decimal point) — used for whole-number "count" fields
//    like ចំនួន (qty). Empty string is allowed so the field can be fully
//    cleared and retyped instead of snapping back to a forced minimum on
//    every keystroke (which is what type="number" + immediate Math.max
//    clamping used to do — you could never delete the "1" to type "17"). ──
const isValidIntInput = (v) => v === '' || /^\d*$/.test(v)

export default function InvoiceCreate() {
  const navigate = useNavigate()

  const [invoiceType,   setInvoiceType]   = useState('customer')
  const [customerName,  setCustomerName]  = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerType,  setCustomerType]  = useState('retail')
  const [partnerId,     setPartnerId]     = useState('')
  const [partners,      setPartners]      = useState([])
  const [note,          setNote]          = useState('')
  const [discountType,  setDiscountType]  = useState('none')
  const [discountValue, setDiscountValue] = useState('')
  const [deposit,       setDeposit]       = useState('')

  // ── Payment mode — 3 explicit states ──
  const [paymentMode,    setPaymentMode]    = useState('paid')
  const [depositCurrency, setDepositCurrency] = useState('KHR')

  // ── Display currency combo box: 'KHR' | 'USD' | 'BOTH' ──
  const [displayCurrency, setDisplayCurrency] = useState('KHR')

  // ── Two independent exchange rates, loaded from Settings ──
  const [usdToKhr,    setUsdToKhr]    = useState(4100)
  const [khrToUsd,    setKhrToUsd]    = useState(4100)
  const [loadingRate, setLoadingRate] = useState(true)

  // ── Real total vs cash-rounded total — user picks which one is "the" total.
  //    Rounded is the default since that's what actually gets handed over/received in cash. ──
  const [useRoundedTotal, setUseRoundedTotal] = useState(true)

  const [search,        setSearch]        = useState('')
  const [browseMode,    setBrowseMode]    = useState('categories')
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

  const [cart,          setCart]          = useState([])
  const [submitting,    setSubmitting]    = useState(false)
  const [customName,    setCustomName]    = useState('')
  const [customPrice,   setCustomPrice]   = useState('')
  const [customCurrency,setCustomCurrency]= useState('KHR')
  // ── Stored as text (not number) for the same reason as sheetBuilder.qty
  //    below — see isValidIntInput comment. ──
  const [customQty,     setCustomQty]     = useState('1')

  // ── Sheet-metal (ស័ង្កសី) length-entry builder. Non-null while a zinc
  //    variant's builder panel is open. Cleared on close, or when the person
  //    navigates to a different product/category.
  //    NOTE: `qty` is kept as TEXT (not a number) while the builder is open,
  //    same reasoning as `length`/`extra1`/`extra2` — a plain
  //    type="number" input that clamps to a minimum on every keystroke makes
  //    it impossible to delete "1" and type "17", since the empty string in
  //    between snaps straight back to "1". It's converted to a real number
  //    only when actually needed (on blur, or when adding the segment). ──
  const [sheetBuilder,  setSheetBuilder]  = useState(null)

  const dSearch = useDebounce(search, 400)

  const catProductsCacheRef = useRef(new Map())
  const variantsCacheRef    = useRef(new Map())
  const browseCardRef       = useRef(null)

  useEffect(() => {
    partnerAPI.list({ limit: 100 }).then(r => setPartners(r.data?.partners ?? [])).catch(() => {})
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

  // ── Category-name matches for the top-level search box. Only relevant when
  //    browsing at the top level (no category drilled into yet) — once inside
  //    a category, the search box only searches that category's products, and
  //    matching against category names again would be confusing. Matched
  //    client-side against the already-loaded `categories` list — cheap, no
  //    extra request, and updates instantly as the user types. ──
  const matchingCategories = (!selectedCat && dSearch)
    ? categories.filter(c => c.name?.toLowerCase().includes(dSearch.toLowerCase()))
    : []

  const openCategory = useCallback(async (cat) => {
    setSheetBuilder(null)
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

  const selectProduct = async (p) => {
    setSheetBuilder(null)
    setSelectedProd(p); setVariants([])

    const cached = variantsCacheRef.current.get(p._id)
    if (cached) { setVariants(cached); return }

    setLoadingVars(true)
    try {
      const res = await variantAPI.listByProduct(p._id)
      const list = Array.isArray(res.data) ? res.data : []
      setVariants(list)
      variantsCacheRef.current.set(p._id, list)
    } catch { toast.error('មិនអាចទាញ Variant បាន') }
    finally { setLoadingVars(false) }
  }

  const goBack = () => {
    setSheetBuilder(null)
    if (selectedProd) { setSelectedProd(null); setVariants([]) }
    else if (browseMode === 'products') {
      setBrowseMode('categories'); setSelectedCat(null); setCatProducts([])
      setSearch(''); setSearchResults([])
    }
    else if (browseMode === 'search')   { setSearch(''); setSearchResults([]); setBrowseMode('categories') }
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

  const groupVariantsByTier = (list) => {
    const groups = { worker: [], owner: [], other: [] }
    list.forEach(v => {
      const brand = v.brand || ''
      const key = brand.includes('ម្ចាស់ផ្ទះ') ? 'owner' : brand.includes('ជាង') ? 'worker' : 'other'
      groups[key].push(v)
    })
    const thicknessOf = (v) => {
      const m = (v.brand || '').match(/\(([\d.]+)/)
      return m ? parseFloat(m[1]) : 0
    }
    Object.values(groups).forEach(g => g.sort((a, b) => thicknessOf(a) - thicknessOf(b)))
    return groups
  }

  const toDisplay = useCallback((amount, fromCurrency, toCurrency) => {
    if (!fromCurrency || fromCurrency === toCurrency) return amount
    if (fromCurrency === 'USD' && toCurrency === 'KHR') return amount * usdToKhr
    if (fromCurrency === 'KHR' && toCurrency === 'USD') return amount / khrToUsd
    return amount
  }, [usdToKhr, khrToUsd])

  const addToCart = (variant) => {
    const variantCurrency = variant.currency || 'KHR'
    const existing = cart.findIndex(c => !c.isCustom && c.variantId === variant._id)
    if (existing >= 0) {
      setCart(prev => prev.map((c,i) => i===existing ? {...c, qty:c.qty+1, subtotal:(c.qty+1)*c.unitPrice} : c))
      toast.success(`+1 → ${variant.unitValue}${variant.unit}`); return
    }
    const tiers = getTiers(variant)
    const defaultTier = tiers.find(t => t.type===customerType) ?? tiers[0]
    setCart(prev => [...prev, {
      isCustom: false,
      variantId:variant._id, sku:variant.sku, productName:selectedProd?.name??'',
      productLabel:selectedProd?.name??'',
      productId:selectedProd?._id??null, variantOptions:variants,
      brand:variant.brand??'', unit:variant.unit, unitValue:variant.unitValue,
      stock:variant.stock, qty:1, unitPrice:defaultTier.price, priceType:defaultTier.type,
      subtotal:defaultTier.price, tiers,
      variantCurrency,
    }])
    toast.success(`បន្ថែម: ${selectedProd?.name} – ${variant.unitValue}${variant.unit}`)
  }

  // ── Open the length-entry builder for a ស័ង្កសី variant instead of adding
  //    it to the cart immediately. qty starts as the TEXT '1', not the
  //    number 1 — see the sheetBuilder state comment above. ──
  const openSheetBuilder = (variant) => {
    setSheetBuilder({ variant, length: '', qty: '1', type: 'straight', extra1: '', extra2: '' })
  }
  const closeSheetBuilder = () => setSheetBuilder(null)

  // ── Add one length entry ("segment") for the variant currently open in the
  //    sheet builder. Segments for the same variant are merged into a single
  //    cart line (one product name, many "length × qty type" rows underneath
  //    — matches how these get printed). Price is locked to the tier price
  //    at the moment the FIRST segment for that variant is added.
  //
  //    For the កោង (curved) cut, two extra measurements are collected —
  //    ចោលចុង and កោង — for RECORD-KEEPING ONLY. They are NOT added into the
  //    length used for pricing: the entered length already includes whatever
  //    allowance the person accounted for, so pricing always uses
  //    length × qty × price-per-meter, regardless of cut type. ត្រង់ and
  //    លាត simply have no extra measurements to record. ──
  const addSheetSegment = () => {
    if (!sheetBuilder) return
    const { variant, length, qty, type, extra1, extra2 } = sheetBuilder
    const lengthNum = Number(length)
    // qty is free text while typing (can be ''), so normalize to a real
    // integer ≥ 1 right here, same as before — just reading from a string.
    const qtyNum = Math.max(1, Number(qty) || 1)
    if (!lengthNum || lengthNum <= 0) { toast.error('សូមបញ្ចូលប្រវែង (m)'); return }

    const tiers = getTiers(variant)
    const defaultTier = tiers.find(t => t.type === customerType) ?? tiers[0]
    const pricePerMeter = defaultTier.price

    // Record-keeping only — NOT added into the price calculation.
    const extra1Num = type === 'curved' ? (Number(extra1) || 0) : 0
    const extra2Num = type === 'curved' ? (Number(extra2) || 0) : 0
    const effectiveLength = lengthNum
    const segSubtotal = lengthNum * qtyNum * pricePerMeter
    const typeLabel = SHEET_TYPES.find(t => t.value === type)?.label ?? type

    const segment = {
      length: lengthNum, qty: qtyNum, type, typeLabel,
      extra1: extra1Num, extra2: extra2Num,
      effectiveLength, subtotal: segSubtotal,
    }

    setCart(prev => {
      const idx = prev.findIndex(c => c.isSheetMetal && c.variantId === variant._id)
      if (idx >= 0) {
        return prev.map((c, i) => i === idx
          ? { ...c, segments: [...c.segments, segment], subtotal: c.subtotal + segSubtotal, qty: c.qty + qtyNum }
          : c)
      }
      return [...prev, {
        isCustom: false,
        isSheetMetal: true,
        variantId: variant._id, sku: variant.sku,
        productName: selectedProd?.name ?? '',
        productLabel: selectedProd?.name ?? '',
        productId: selectedProd?._id ?? null, variantOptions: variants,
        brand: variant.brand ?? '', unit: variant.unit ?? 'm', unitValue: variant.unitValue ?? '',
        stock: variant.stock, qty: qtyNum,
        unitPrice: pricePerMeter, priceType: defaultTier.type,
        subtotal: segSubtotal, tiers,
        variantCurrency: variant.currency || 'KHR',
        segments: [segment],
      }]
    })

    toast.success(`បន្ថែម: ${lengthNum} × ${qtyNum} ${typeLabel}`)

    // Reset the entry fields only — keep the builder (and variant) open so
    // the next length can be typed in right away. qty resets to the TEXT
    // '1', matching the state's type.
    setSheetBuilder(prev => prev ? { ...prev, length: '', qty: '1', type: 'straight', extra1: '', extra2: '' } : prev)
  }

  // ── Remove one length entry from a ស័ង្កសី cart line. If that was the last
  //    segment, the whole cart line is removed. ──
  const removeSheetSegment = (cartIdx, segIdx) => {
    setCart(prev => prev
      .map((c, i) => {
        if (i !== cartIdx || !c.isSheetMetal) return c
        const seg = c.segments[segIdx]
        const newSegments = c.segments.filter((_, si) => si !== segIdx)
        if (newSegments.length === 0) return null
        return { ...c, segments: newSegments, subtotal: c.subtotal - seg.subtotal, qty: c.qty - seg.qty }
      })
      .filter(Boolean))
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
    setCustomName(''); setCustomPrice(''); setCustomQty('1')
  }

  const setQty    = (idx,raw)  => { const qty=Math.max(1,Number(raw)||1); setCart(prev=>prev.map((c,i)=>i===idx?{...c,qty,subtotal:qty*c.unitPrice}:c)) }
  const applyTier = (idx,tier) => setCart(prev=>prev.map((c,i)=>i===idx?{...c,unitPrice:tier.price,priceType:tier.type,subtotal:c.qty*tier.price}:c))
  const setPrice  = (idx,raw)  => { const unitPrice=Math.max(0,Number(raw)||0); setCart(prev=>prev.map((c,i)=>i===idx?{...c,unitPrice,priceType:'custom',subtotal:c.qty*unitPrice}:c)) }
  const setProductName = (idx, name) => setCart(prev => prev.map((c,i) => i===idx ? { ...c, productName: name } : c))
  const switchVariant = (idx, newVariantId) => {
    setCart(prev => prev.map((c, i) => {
      if (i !== idx || c.isCustom) return c
      const newVariant = (c.variantOptions || []).find(v => v._id === newVariantId)
      if (!newVariant) return c
      const tiers = getTiers(newVariant)
      const keepTier = tiers.find(t => t.type === c.priceType) ?? tiers.find(t => t.type === customerType) ?? tiers[0]
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
  const removeItem = (idx)     => setCart(prev=>prev.filter((_,i)=>i!==idx))

  const goToProduct = (item) => {
    if (item.isCustom || !item.productId) return
    setSearch('')
    setSelectedProd({ _id: item.productId, name: item.productLabel || item.productName })
    setVariants(item.variantOptions || [])
    setBrowseMode('products')
    browseCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const hasKHR = cart.some(c => (c.variantCurrency || 'KHR') === 'KHR')
  const hasUSD = cart.some(c => (c.variantCurrency || 'KHR') === 'USD')
  const isMixedCurrency = hasKHR && hasUSD

  const subtotalKhrNative = cart
    .filter(c => (c.variantCurrency || 'KHR') === 'KHR')
    .reduce((s, c) => s + c.subtotal, 0)
  const subtotalUsdNative = cart
    .filter(c => (c.variantCurrency || 'KHR') === 'USD')
    .reduce((s, c) => s + c.subtotal, 0)

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

  // ── Rounded ("update") totals — only meaningful for KHR, since the rule is
  //    a cash-denomination rounding (nearest 500 riel). USD amounts are left
  //    untouched. `effective*` is whichever one the toggle currently selects,
  //    and is what deposit math / status / display actually use downstream. ──
  const roundedTotal = displayCurrency === 'KHR' ? roundToNearest500(total || 0) : null
  const effectiveTotal = displayCurrency === 'KHR' && useRoundedTotal ? roundedTotal : total

  const roundedTotalKhrBoth = roundToNearest500(totalKhrBoth || 0)
  const effectiveTotalKhrBoth = useRoundedTotal ? roundedTotalKhrBoth : totalKhrBoth

  const rawDepositInput = paymentMode === 'deposit' ? (Number(deposit) || 0) : 0

  let depositKhrApplied = 0
  let depositUsdApplied = 0
  let remainingKhrAfterDeposit = 0
  let remainingUsdAfterDeposit = 0

  if (displayCurrency === 'BOTH') {
    if (depositCurrency === 'USD') {
      const grandTotalInUSD = totalUsdBoth + (effectiveTotalKhrBoth / khrToUsd)
      const capped = Math.min(rawDepositInput, grandTotalInUSD)
      depositUsdApplied = Math.min(capped, totalUsdBoth)
      remainingUsdAfterDeposit = Math.max(0, totalUsdBoth - depositUsdApplied)
      const leftoverUSD = capped - depositUsdApplied
      if (leftoverUSD > 0 && effectiveTotalKhrBoth > 0) {
        const leftoverAsKHR = leftoverUSD * usdToKhr
        depositKhrApplied = Math.min(leftoverAsKHR, effectiveTotalKhrBoth)
        remainingKhrAfterDeposit = Math.max(0, effectiveTotalKhrBoth - depositKhrApplied)
      } else {
        remainingKhrAfterDeposit = effectiveTotalKhrBoth
      }
    } else {
      const grandTotalInKHR = effectiveTotalKhrBoth + (totalUsdBoth * usdToKhr)
      const capped = Math.min(rawDepositInput, grandTotalInKHR)
      depositKhrApplied = Math.min(capped, effectiveTotalKhrBoth)
      remainingKhrAfterDeposit = Math.max(0, effectiveTotalKhrBoth - depositKhrApplied)
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
    const applied = Math.min(convertedDeposit, effectiveTotal || 0)
    if (displayCurrency === 'USD') { depositUsdApplied = applied } else { depositKhrApplied = applied }
  }

  const remaining = displayCurrency === 'BOTH'
    ? null
    : Math.max(0, (effectiveTotal || 0) - (paymentMode === 'deposit' ? Math.min(displayCurrency === 'USD' ? depositUsdApplied : depositKhrApplied, effectiveTotal || 0) : 0))

  const pageCount = Math.max(1, Math.ceil(cart.length / ROWS_PER_PAGE))

  const fmtDisplay = (n) => displayCurrency === 'USD' ? fmtUSD(n) : fmtKHR(n)

  const submit = async () => {
    if (!cart.length)                          { toast.error('សូមជ្រើសផលិតផលយ៉ាងហោចណាស់ 1'); return }
    if (invoiceType==='partner' && !partnerId) { toast.error('សូមជ្រើសដៃគូ'); return }
    const overStock = cart.find(c => !c.isCustom && c.qty > c.stock)
    if (overStock) { toast.error(`ស្ទុំមិនគ្រប់: ${overStock.sku} (${overStock.stock} នៅសល់)`); return }

    setSubmitting(true)
    try {
      let invoiceStatus
      if (paymentMode === 'pending') {
        invoiceStatus = 'pending'
      } else if (paymentMode === 'paid') {
        invoiceStatus = 'paid'
      } else {
        if (displayCurrency === 'BOTH') {
          const bothCovered = remainingKhrAfterDeposit === 0 && remainingUsdAfterDeposit === 0
          const anyCovered  = depositKhrApplied > 0 || depositUsdApplied > 0
          invoiceStatus = bothCovered ? 'paid' : anyCovered ? 'partial' : 'pending'
        } else {
          const appliedAmt = displayCurrency === 'USD' ? depositUsdApplied : depositKhrApplied
          invoiceStatus = appliedAmt > 0 && appliedAmt >= (effectiveTotal || 0) ? 'paid' : appliedAmt > 0 ? 'partial' : 'pending'
        }
      }

      const payload = {
        invoiceType,
        customerName:  invoiceType==='customer' ? customerName : undefined,
        customerPhone, customerType,
        partnerId:     invoiceType==='partner' ? partnerId : undefined,
        note, discountType,
        discountValue: Number(discountValue) || 0,
        depositInputAmount: paymentMode === 'deposit' ? rawDepositInput : 0,
        depositInputCurrency: (paymentMode === 'deposit' && rawDepositInput > 0) ? depositCurrency : null,
        status: invoiceStatus,
        currency: displayCurrency,
        usdToKhrRate: usdToKhr,
        khrToUsdRate: khrToUsd,
        // ── Cash-rounding choice — sent alongside so the backend/print can
        //    reflect whichever total the person actually selected. ──
        roundingApplied: displayCurrency === 'BOTH' ? useRoundedTotal : (displayCurrency === 'KHR' && useRoundedTotal),
        totalKhr: displayCurrency === 'BOTH' ? effectiveTotalKhrBoth : (displayCurrency === 'KHR' ? effectiveTotal : undefined),
        items: cart.map(c => {
          const vCurrency = c.variantCurrency || 'KHR'
          const finalUnitPrice = displayCurrency === 'BOTH'
            ? c.unitPrice
            : toDisplay(c.unitPrice, vCurrency, displayCurrency)
          const finalSubtotal = displayCurrency === 'BOTH'
            ? c.subtotal
            : toDisplay(c.subtotal, vCurrency, displayCurrency)
          const base = {
            quantity: c.qty,
            unitPrice: finalUnitPrice,
            // Sheet-metal lines: subtotal is the sum of its segments (converted),
            // not qty × unitPrice — unitPrice here is price-per-meter, and qty
            // is a count of sheets, not meters, so qty × unitPrice would be wrong.
            subtotal: c.isSheetMetal ? finalSubtotal : c.qty * finalUnitPrice,
            isCustom: c.isCustom,
            ...(displayCurrency === 'BOTH' ? { currency: vCurrency } : {}),
            ...(c.isSheetMetal ? {
              isSheetMetal: true,
              segments: c.segments.map(seg => ({
                length: seg.length, qty: seg.qty, type: seg.type, typeLabel: seg.typeLabel,
                extra1: seg.extra1, extra2: seg.extra2, effectiveLength: seg.effectiveLength,
                subtotal: displayCurrency === 'BOTH' ? seg.subtotal : toDisplay(seg.subtotal, vCurrency, displayCurrency),
              })),
            } : {}),
          }
          return c.isCustom
            ? { ...base, variantId: null, productName: c.productName }
            : { ...base, variantId: c.variantId, productName: c.productName }
        }),
      }

      const res = await invoiceAPI.create(payload)
      const createdInvoice = res.data

      try {
        const ok = await sendOrderToTelegram(createdInvoice, 'ថ្មី')
        if (ok) toast.success('📨 បានផ្ញើការបញ្ជាទិញទៅ Telegram!')
        else    toast('⚠️ មិនអាចផ្ញើ Telegram បាន', { icon: '⚠️' })
      } catch {
        toast('⚠️ Telegram បរាជ័យ — វិក្កយបត្របានរក្សាទុករួចហើយ', { icon: '⚠️' })
      }

      toast.success('✅ បង្កើតវិក្កយបត្រដោយជោគជ័យ!')
      navigate(`/invoices/${createdInvoice._id}`)
    } catch (err) {
      const status = err?.response?.status
      const msg    = err?.response?.data?.message || err?.message || 'មានបញ្ហា'
      if      (status === 404) toast.error('❌ API route រកមិនឃើញ — ពិនិត្យ backend')
      else if (status === 401) toast.error('❌ Session ផុតកំណត់ — សូម login ម្តងទៀត')
      else if (status === 400) toast.error(`❌ ទិន្នន័យខុស: ${msg}`)
      else if (status === 500) toast.error(`❌ Server error: ${msg}`)
      else                     toast.error(`❌ ${msg}`)
    } finally { setSubmitting(false) }
  }

  const breadcrumb = selectedProd
    ? `${selectedCat?.name ?? ''} › ${selectedProd.name}`
    : selectedCat?.name ?? (browseMode==='search' ? `លទ្ធផល: "${dSearch}"` : null)

  // ── NOTE ON THE FUNCTIONS BELOW (ProductGrid, CategoryMatchGrid,
  //    SheetBuilderPanel, VariantCard, VariantSections):
  //
  //    These are plain functions that return JSX, defined inside this
  //    component so they can close over local state/handlers without prop-
  //    drilling everything. They are called DIRECTLY as functions —
  //    `{SheetBuilderPanel()}` — rather than rendered as JSX components —
  //    `<SheetBuilderPanel />`.
  //
  //    This distinction matters a lot: if you write `<SheetBuilderPanel />`,
  //    React treats `SheetBuilderPanel` as a component type. Because this
  //    function is redefined on every render of InvoiceCreate (it's declared
  //    inside the component body), React sees a "new" component type on
  //    every re-render — even though the code is identical — and throws away
  //    the whole previous DOM subtree, mounting a fresh one from scratch.
  //    That's what caused any input inside these blocks (e.g. the ស័ង្កសី
  //    length/qty fields) to lose focus after every single keystroke: each
  //    keystroke → setState → re-render → "new" component → remount → focus
  //    lost, and you had to click back into the box for every character.
  //
  //    Calling them as plain functions instead means their returned JSX is
  //    just inlined into InvoiceCreate's own render output — there's no
  //    separate component boundary at all, so React diffs the actual
  //    elements (divs, inputs, etc.) in place and keeps focus intact. ──
  const ProductGrid = ({ items, loading }) => (
    loading && items.length === 0
      ? <p className="text-center text-gray-400 py-10">កំពុងផ្ទុក...</p>
      : items.length === 0
        ? <div className="text-center py-12"><p className="text-5xl mb-3">📦</p><p className="text-sm text-gray-400">គ្មានផលិតផល</p></div>
        : <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 items-stretch">
            {items.map(p => {
              const cartQtyForProduct = cart.reduce((s, c) => s + (!c.isCustom && c.productId === p._id ? c.qty : 0), 0)
              return (
                <button key={p._id} onClick={() => selectProduct(p)}
                  className={`relative h-full min-h-[76px] flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all active:scale-95 ${cartQtyForProduct > 0 ? 'border-indigo-400 bg-indigo-50/60' : 'border-gray-200 hover:border-indigo-400 hover:bg-indigo-50'}`}>
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

  // ── Category quick-jump cards shown above search results when the search
  //    text matches a category name (top-level search only). Clicking opens
  //    that category via the normal openCategory flow. ──
  const CategoryMatchGrid = ({ items }) => (
    items.length === 0 ? null : (
      <div className="mb-4">
        <p className="text-xs font-semibold text-gray-500 mb-2">🗂️ ប្រភេទដែលត្រូវនឹងការស្វែងរក</p>
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 items-stretch">
          {items.map(cat => (
            <button key={cat._id} onClick={() => openCategory(cat)}
              className="h-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-indigo-300 bg-indigo-50 hover:border-indigo-500 hover:bg-indigo-100 text-left transition-all active:scale-95">
              <span className="text-2xl shrink-0">🗂️</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-indigo-700 truncate">{cat.name}</p>
                {cat.productCount != null && <p className="text-xs text-indigo-400">{cat.productCount} ផលិតផល</p>}
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  )

  // ── Sheet-metal length-entry builder panel. Shown above the variant grid
  //    while a ស័ង្កសី variant is being built up with length entries. ──
  const SheetBuilderPanel = () => {
    if (!sheetBuilder) return null
    const { variant, length, qty, type, extra1, extra2 } = sheetBuilder
    const existing = cart.find(c => c.isSheetMetal && c.variantId === variant._id)
    const vCurrency = variant.currency || 'KHR'
    return (
      <div className="mb-4 p-4 rounded-xl border-2 border-teal-300 bg-teal-50 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-teal-700">
            📏 {variant.unitValue}{variant.unit}{variant.brand ? ` · ${variant.brand}` : ''} — បញ្ចូលប្រវែងសន្លឹក
          </p>
          <button onClick={closeSheetBuilder} className="text-xs text-teal-600 hover:text-teal-800 font-semibold shrink-0">
            ✕ បិទ
          </button>
        </div>

        <div className="flex flex-wrap gap-2 items-end">
          <div className="w-28">
            <label className="block text-xs font-medium text-gray-500 mb-1">ប្រវែង (m)</label>
            <input type="text" inputMode="decimal" className="input-field text-sm text-right"
              value={length} placeholder="2.34"
              onChange={e => { const v = e.target.value; if (isValidDecimalInput(v)) setSheetBuilder(p => ({ ...p, length: v })) }}
              onKeyDown={e => e.key === 'Enter' && addSheetSegment()} />
          </div>
          <div className="w-20">
            <label className="block text-xs font-medium text-gray-500 mb-1">ចំនួន</label>
            {/* type="text" + free typing (isValidIntInput allows '' mid-edit)
                instead of type="number" with an immediate Math.max(1, ...)
                clamp — that old clamp made it impossible to delete the "1"
                to type a different number, since every keystroke that
                produced '' was instantly snapped back to "1" before the next
                digit could be typed. Now the value only gets normalized to a
                real integer ≥ 1 on blur (or when the segment is added). */}
            <input type="text" inputMode="numeric" className="input-field text-sm text-center"
              value={qty}
              onChange={e => { const v = e.target.value; if (isValidIntInput(v)) setSheetBuilder(p => ({ ...p, qty: v })) }}
              onBlur={() => setSheetBuilder(p => p ? { ...p, qty: String(Math.max(1, Number(p.qty) || 1)) } : p)}
              onKeyDown={e => e.key === 'Enter' && addSheetSegment()} />
          </div>
          <div className="w-28">
            <label className="block text-xs font-medium text-gray-500 mb-1">ប្រភេទ</label>
            <select className="input-field text-sm" value={type}
              onChange={e => setSheetBuilder(p => ({ ...p, type: e.target.value }))}>
              {SHEET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          {type === 'curved' && (
            <>
              {/* ចោលចុង / កោង — record-keeping only, NOT used in the price
                  calculation (see addSheetSegment). text + inputMode=decimal
                  so decimals type reliably, restricted via isValidDecimalInput
                  to digits + a single dot. */}
              <div className="w-24">
                <label className="block text-xs font-medium text-gray-500 mb-1">ចោលចុង</label>
                <input type="text" inputMode="decimal" className="input-field text-sm text-right"
                  value={extra1} placeholder="0"
                  onChange={e => { const v = e.target.value; if (isValidDecimalInput(v)) setSheetBuilder(p => ({ ...p, extra1: v })) }} />
              </div>
              <div className="w-24">
                <label className="block text-xs font-medium text-gray-500 mb-1">កោង</label>
                <input type="text" inputMode="decimal" className="input-field text-sm text-right"
                  value={extra2} placeholder="0"
                  onChange={e => { const v = e.target.value; if (isValidDecimalInput(v)) setSheetBuilder(p => ({ ...p, extra2: v })) }} />
              </div>
            </>
          )}
          <button onClick={addSheetSegment}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-semibold h-[38px] shrink-0">
            + បន្ថែម
          </button>
        </div>

        {existing && existing.segments.length > 0 && (
          <div className="pt-2 border-t border-teal-200 space-y-1">
            {existing.segments.map((seg, si) => (
              <div key={si} className="flex justify-between items-center text-xs bg-white rounded-lg px-2 py-1.5 border border-teal-100">
                <span>
                  {seg.length} × {seg.qty} {seg.typeLabel}
                  {seg.type === 'curved' ? ` (ចោលចុង ${seg.extra1}, កោង ${seg.extra2})` : ''}
                </span>
                <span className="font-semibold text-teal-700">
                  {vCurrency === 'USD' ? fmtUSD(seg.subtotal) : fmtKHR(seg.subtotal)}
                </span>
              </div>
            ))}
            <div className="flex justify-between text-xs font-bold text-teal-800 pt-1">
              <span>សរុប:</span>
              <span>{vCurrency === 'USD' ? fmtUSD(existing.subtotal) : fmtKHR(existing.subtotal)}</span>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Variant card — min-height + h-full keeps cards level with each other
  //    even when one has 1 price tier and its neighbor has 3.
  //    NOTE: this one was already called as a plain function (VariantCard(v))
  //    everywhere it's used, not as a JSX tag, so it never had the remount
  //    problem described above. It's left as-is. ──
  const VariantCard = (v) => {
    const tiers = getTiers(v)
    const vCurrency = v.currency || 'KHR'
    const cartIdx = cart.findIndex(c => !c.isCustom && c.variantId === v._id)
    const inCart = cartIdx >= 0
    const cartQty = inCart ? cart[cartIdx].qty : 0
    const isZinc = isZincProduct(selectedProd?.name)

    const decrementOrRemove = (e) => {
      e.stopPropagation()
      if (cartQty <= 1) removeItem(cartIdx)
      else setQty(cartIdx, cartQty - 1)
    }

    return (
      <div key={v._id} className="relative h-full">
        {inCart && (
          <div className="absolute -top-2 -right-2 z-10 flex items-center gap-1">
            <span className="bg-indigo-600 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center shadow">
              {isZinc ? `${cartQty} សន្លឹក` : `${cartQty} ក្នុងកន្ត្រក`}
            </span>
            {/* Sheet-metal lines are edited by adding/removing length entries in
                the builder panel or per-segment in the cart, not by a single
                quick-decrement here — so that button is hidden for them. */}
            {!isZinc && (
              <button type="button" onClick={decrementOrRemove} title="ដកចេញពីកន្ត្រក"
                className="w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 text-white text-xs font-bold flex items-center justify-center shadow">
                −
              </button>
            )}
          </div>
        )}
        <button onClick={() => isZinc ? openSheetBuilder(v) : addToCart(v)} disabled={v.stock <= 0}
          className={`w-full h-full min-h-[188px] flex flex-col text-left p-4 rounded-xl border-2 bg-white transition-all ${
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
          <div className="mt-2 space-y-1 flex-1">
            {tiers.map((t,i) => (
              <div key={i} className="flex justify-between items-center">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${TIER_COLORS[t.type]??'bg-gray-100 text-gray-500'}`}>{t.label}</span>
                <span className="text-xs font-bold text-indigo-600">{vCurrency === 'USD' ? fmtUSD(t.price) : fmtKHR(t.price)}{isZinc ? '/m' : ''}</span>
              </div>
            ))}
          </div>
        </button>
      </div>
    )
  }

  const VariantSections = ({ list }) => {
    const groups = groupVariantsByTier(list)
    const sections = [
      { key: 'worker', label: 'ជាង',         icon: '🔴', wrapCls: 'bg-red-200/50 border-red-300' },
      { key: 'owner',  label: 'ម្ចាស់ផ្ទះ', icon: '🔵', wrapCls: 'bg-blue-200/50 border-blue-300' },
      { key: 'other',  label: 'ផ្សេងៗ',      icon: '⚪', wrapCls: 'bg-gray-100/50 border-gray-200' },
    ]
    return (
      <div className="space-y-4">
        {sections.map(({ key, label, icon, wrapCls }) => {
          const items = groups[key]
          if (items.length === 0) return null
          return (
            <div key={key} className={`rounded-xl border p-3 ${wrapCls}`}>
              <p className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                {icon} {label} <span className="text-gray-400 font-normal">({items.length})</span>
              </p>
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 items-stretch">
                {items.map(v => VariantCard(v))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">

      {/* ════ LEFT ════ */}
      <div className="flex-1 space-y-4 min-w-0 w-full">

        {/* Invoice header card */}
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-gray-700">ប្រភេទវិក្កយបត្រ</h3>
          <div className="flex gap-2">
            {[['customer','👤 អតិថិជន'],['partner','🤝 ដៃគូ']].map(([v,l])=>(
              <button key={v} onClick={()=>setInvoiceType(v)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${invoiceType===v?'bg-indigo-600 text-white border-indigo-600':'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{l}</button>
            ))}
          </div>
          {invoiceType==='customer' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="ឈ្មោះអតិថិជន"><input className="input-field" placeholder="អ្នកទិញ..." value={customerName} onChange={e=>setCustomerName(e.target.value)}/></FormField>
              <FormField label="ទូរស័ព្ទ"><input className="input-field" placeholder="09X..." value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)}/></FormField>
              <FormField label="ប្រភេទអតិថិជន">
                <select className="input-field" value={customerType} onChange={e=>setCustomerType(e.target.value)}>
                  <option value="retail">រាយ</option><option value="wholesale">លក់ដុំ</option><option value="vip">VIP</option>
                </select>
              </FormField>
            </div>
          ) : (
            <FormField label="ដៃគូ" required>
              <select className="input-field" value={partnerId} onChange={e=>setPartnerId(e.target.value)}>
                <option value="">-- ជ្រើសដៃគូ --</option>
                {partners.map(p=><option key={p._id} value={p._id}>{p.name}{p.phone?` (${p.phone})`:''}</option>)}
              </select>
            </FormField>
          )}

          <div className="border-t border-gray-100 pt-4 space-y-3">
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

            <select
              value={displayCurrency}
              onChange={e => setDisplayCurrency(e.target.value)}
              className="input-field font-semibold"
            >
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
                ℹ️ មិនបម្លែងទេ — ទំនិញ ៛ បូកគ្នាដាច់ដោយឡែក និងទំនិញ $ បូកគ្នាដាច់ដោយឡែក។ វិក្កយបត្រនឹងរក្សាទុកទាំងពីរយ៉ាង ដាច់ដោយឡែកពីគ្នា។
              </div>
            )}
          </div>
        </div>

        {/* Product browser card */}
        <div className="card p-5" ref={browseCardRef}>
          <SearchBar value={search} onChange={v => { setSearch(v); if (!v) { setBrowseMode(selectedCat ? 'products' : 'categories'); setSearchResults([]) } }}
            placeholder="ស្វែងរកឈ្មោះផលិតផល ឬប្រភេទ..."/>

          {(browseMode !== 'categories' || selectedProd) && (
            <div className="flex items-center gap-2 mt-3 mb-1 flex-wrap">
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
            {/* VARIANTS */}
            {selectedProd && (
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-3">📦 {selectedProd.name}</p>
                {SheetBuilderPanel()}
                {loadingVars
                  ? <p className="text-center text-gray-400 py-8">កំពុងទាញ...</p>
                  : variants.length === 0
                    ? <div className="text-center py-8 space-y-2"><p className="text-4xl">📭</p><p className="text-sm text-gray-500">ផលិតផលនេះគ្មាន Variant</p></div>
                    : VariantSections({ list: variants })
                }
              </div>
            )}

            {/* SEARCH RESULTS — includes matching categories above matching products */}
            {!selectedProd && browseMode === 'search' && (
              <div>
                <p className="text-xs text-gray-500 mb-3">លទ្ធផលស្វែងរក: <span className="font-semibold text-gray-700">"{dSearch}"</span></p>
                {CategoryMatchGrid({ items: matchingCategories })}
                {ProductGrid({ items: searchResults, loading: loadingSearch })}
              </div>
            )}

            {/* CATEGORY PRODUCTS */}
            {!selectedProd && browseMode === 'products' && (
              <div>
                {ProductGrid({
                  items: dSearch ? searchResults : catProducts,
                  loading: dSearch ? loadingSearch : loadingProds,
                })}
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

            {/* CATEGORY LIST — 2-per-row on tablet/iPad and phone, 3 only on large desktop */}
            {!selectedProd && browseMode === 'categories' && (
              <div>
                {loadingCats
                  ? <p className="text-center text-gray-400 py-10">កំពុងផ្ទុកប្រភេទ...</p>
                  : categories.length === 0
                    ? <div className="text-center py-12"><p className="text-5xl mb-3">🗂️</p><p className="text-sm text-gray-400">គ្មានប្រភេទ</p></div>
                    : <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 items-stretch">
                        {categories.map(cat => (
                          <button key={cat._id} onClick={() => openCategory(cat)}
                            className="h-full flex items-center gap-3 px-4 py-4 rounded-xl border-2 border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 text-left transition-all active:scale-95 group">
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

        {/* CUSTOM ITEM CARD */}
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
              {/* Same fix as sheetBuilder.qty: free-text while typing, only
                  normalized to a real integer ≥ 1 on blur, so you can clear
                  the default "1" and type any number without it snapping
                  back mid-edit. */}
              <input type="text" inputMode="numeric" className="input-field text-sm text-center" placeholder="1" value={customQty}
                onChange={e => { const v = e.target.value; if (isValidIntInput(v)) setCustomQty(v) }}
                onBlur={() => setCustomQty(String(Math.max(1, Number(customQty) || 1)))}
                onKeyDown={e => e.key === 'Enter' && addCustomToCart()} />
            </div>
            <button onClick={addCustomToCart}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors shrink-0 h-[38px]">
              + បន្ថែម
            </button>
          </div>
          {customName.trim() && Number(customPrice) > 0 && (
            <div className="mt-2 text-xs text-gray-400 text-right">
              សរុប: <span className="font-semibold text-indigo-600">
                {customCurrency === 'USD' ? fmtUSD((Number(customQty)||1) * Number(customPrice)) : fmtKHR((Number(customQty)||1) * Number(customPrice))}
              </span>
            </div>
          )}
        </div>

        {/* PAGE SPLIT NOTICE */}
        {cart.length > ROWS_PER_PAGE && displayCurrency !== 'BOTH' && (
          <div className="card p-4 border-amber-200 bg-amber-50">
            <p className="text-sm font-semibold text-amber-700 mb-2">
              📄 ទំនិញសរុប {cart.length} ធាតុ — នឹងបែកចេញជា {pageCount} ទំព័រ ({pageCount * 2} ទំព័រពេលបោះពុម្ព)
            </p>
            <div className="space-y-1">
              {Array.from({length: pageCount}, (_, i) => {
                const slice = cart.slice(i * ROWS_PER_PAGE, (i + 1) * ROWS_PER_PAGE)
                const sliceTotal = slice.reduce((s,c) => s + toDisplay(c.subtotal, c.variantCurrency || 'KHR', displayCurrency), 0)
                return (
                  <div key={i} className="flex justify-between text-xs text-amber-600 bg-white rounded-lg px-3 py-1.5 border border-amber-100">
                    <span>ទំព័រ {i+1}: ធាតុ {i*ROWS_PER_PAGE+1}–{i*ROWS_PER_PAGE+slice.length}</span>
                    <span className="font-semibold">{fmtDisplay(sliceTotal)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ════ RIGHT: CART — full width on phone/tablet, fixed width + sticky on desktop ════ */}
      <div className="w-full lg:w-[440px] lg:shrink-0">
        <div className="card lg:sticky lg:top-4">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="font-bold text-gray-800 text-base">
              🛒 ទំនិញ ({cart.length})
              {cart.length > ROWS_PER_PAGE && displayCurrency !== 'BOTH' && (
                <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">{pageCount} ទំព័រ</span>
              )}
            </h3>
            {cart.length > 0 && (
              <button onClick={() => setCart([])} className="text-xs text-red-400 hover:text-red-600 font-medium">លុបទាំងអស់</button>
            )}
          </div>

          {/* Cart items — alternating colored border + rounded corners so each
              product line reads as its own distinct card, not a single blur. */}
          <div className="max-h-[500px] overflow-y-auto p-3 space-y-3">
            {cart.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <p className="text-5xl mb-3">🛒</p>
                <p className="text-sm">ស្វែងរក ឬបន្ថែមទំនិញផ្ទាល់ខ្លួន</p>
              </div>
            ) : cart.map((item, idx) => {
              const vCurrency = item.variantCurrency || 'KHR'
              const shownSubtotal = displayCurrency === 'BOTH'
                ? item.subtotal
                : toDisplay(item.subtotal, vCurrency, displayCurrency)
              const shownCurrencyLabel = displayCurrency === 'BOTH' ? vCurrency : displayCurrency
              const stripeCls = idx % 2 === 0 ? 'border-indigo-200 bg-indigo-50/30' : 'border-teal-200 bg-teal-50/30'
              return (
                <div key={idx} className={`p-4 space-y-3 rounded-2xl border-2 ${stripeCls}`}>
                  <div className="flex items-start justify-between gap-2">
                    <input
                      value={item.productName}
                      onChange={e => setProductName(idx, e.target.value)}
                      className="font-bold text-gray-800 bg-transparent border-b border-dashed border-gray-300 focus:outline-none focus:border-indigo-400 flex-1 min-w-0 py-0.5"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      {!item.isCustom && item.productId && (
                        <button onClick={() => goToProduct(item)} title="ទៅកាន់ផលិតផលនេះ — បន្ថែមទំហំ/ប្រភេទផ្សេងទៀត"
                          className="flex items-center gap-1 text-[11px] font-semibold text-indigo-500 hover:text-white hover:bg-indigo-500 border border-indigo-200 hover:border-indigo-500 rounded-lg px-2 py-1 transition-colors">
                          ↗ ទំហំផ្សេង
                        </button>
                      )}
                      <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 text-xl font-bold leading-none px-1">×</button>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {item.isCustom && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 font-semibold">ផ្ទាល់ខ្លួន</span>
                    )}
                    {item.isSheetMetal && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 font-semibold">📏 លក់តាមម៉ែត្រ</span>
                    )}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${vCurrency === 'USD' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                      {vCurrency === 'USD' ? '$' : '៛'}
                    </span>
                    {!item.isCustom && (
                      <span className="text-xl text-gray-400">
                        {item.unitValue}{item.unit}{item.brand?` · ${item.brand}`:''}
                        <span className="ml-1.5 font-mono text-gray-300">({item.sku})</span>
                      </span>
                    )}
                  </div>

                  {item.isSheetMetal ? (
                    // ── Sheet-metal line: read-only list of length entries
                    //    ("segments") instead of the normal qty/price row.
                    //    Each entry can be removed on its own; removing the
                    //    last one removes the whole cart line. ──
                    <div className="space-y-1.5">
                      {item.segments.map((seg, si) => (
                        <div key={si} className="flex justify-between items-center text-xs bg-white/70 rounded-lg px-2.5 py-1.5 border border-gray-200">
                          <span className="text-gray-700">
                            {seg.length} × {seg.qty} {seg.typeLabel}
                            {seg.type === 'curved' ? ` (ចោលចុង ${seg.extra1}, កោង ${seg.extra2})` : ''}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-semibold text-green-600">
                              {vCurrency === 'USD' ? fmtUSD(seg.subtotal) : fmtKHR(seg.subtotal)}
                            </span>
                            <button onClick={() => removeSheetSegment(idx, si)} className="text-red-400 hover:text-red-600 font-bold leading-none">×</button>
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-between items-center pt-1.5 border-t border-gray-200 text-sm">
                        <span className="text-gray-500">
                          {vCurrency === 'USD' ? fmtUSD(item.unitPrice) : fmtKHR(item.unitPrice)}/m × សរុប:
                        </span>
                        <span className="text-base font-bold text-green-600">
                          {shownCurrencyLabel === 'USD' ? fmtUSD(shownSubtotal) : fmtKHR(shownSubtotal)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Variant switch combo box — bigger box + bigger font */}
                      {!item.isCustom && item.variantOptions?.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-gray-400 shrink-0">🔀 ប្តូរប្រភេទ:</span>
                          <select
                            value={item.variantId}
                            onChange={e => switchVariant(idx, e.target.value)}
                            className="flex-1 min-w-0 text-sm sm:text-base font-medium border-2 border-gray-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:border-indigo-400"
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
                          <button onClick={() => setQty(idx, item.qty-1)} className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 font-bold text-lg">−</button>
                          <input type="number" min="1" value={item.qty} onChange={e => setQty(idx, e.target.value)} className="w-12 text-center text-sm font-semibold py-1 border-x border-gray-200 focus:outline-none"/>
                          <button onClick={() => setQty(idx, item.qty+1)} className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 font-bold text-lg">+</button>
                        </div>
                        <span className="text-gray-400 font-bold">×</span>
                        <div className="flex-1 relative">
                          <input type="number" min="0" value={item.unitPrice} onChange={e => setPrice(idx, e.target.value)} className="w-full border-2 border-gray-200 rounded-lg text-sm text-right pr-6 pl-2 py-1.5 font-semibold focus:outline-none focus:border-indigo-400 bg-white"/>
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
                    </>
                  )}
                  {!item.isCustom && item.qty > item.stock && (
                    <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-1.5">⚠️ ស្ទុំមានតែ {item.stock}</p>
                  )}
                </div>
              )
            })}
          </div>

          <div className="p-5 border-t border-gray-100 space-y-4">
            <div className="flex gap-2 flex-wrap">
              <select value={discountType} onChange={e=>{setDiscountType(e.target.value);setDiscountValue('')}} className="border-2 border-gray-200 rounded-xl text-sm px-3 py-2 focus:outline-none focus:border-indigo-400 w-28">
                <option value="none">បញ្ចុះ</option><option value="percent">% ភាគរយ</option><option value="fixed">ចំនួនថេរ</option>
              </select>
              {discountType !== 'none' && <input type="number" min="0" value={discountValue} onChange={e=>setDiscountValue(e.target.value)} placeholder={discountType==='percent'?'10':'5000'} className="flex-1 border-2 border-gray-200 rounded-xl text-sm px-3 py-2 focus:outline-none focus:border-indigo-400"/>}
            </div>
            <input value={note} onChange={e=>setNote(e.target.value)} placeholder="ចំណាំ..." className="w-full border-2 border-gray-200 rounded-xl text-sm px-3 py-2 focus:outline-none focus:border-indigo-400"/>

            {/* Totals — single currency mode (KHR or USD) */}
            {displayCurrency !== 'BOTH' && (
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm text-gray-600"><span>សរុបរង:</span><span className="font-semibold">{fmtDisplay(subtotalInDisplay)}</span></div>
                {discountAmt > 0 && <div className="flex justify-between text-sm text-red-500"><span>បញ្ចុះ{discountType==='percent'?` ${discountValue}%`:''}:</span><span className="font-semibold">−{fmtDisplay(discountAmt)}</span></div>}

                {/* Real vs Rounded total picker — KHR only, rounded selected by default */}
                {displayCurrency === 'KHR' ? (
                  <div className="pt-2 border-t border-gray-200 space-y-1.5">
                    <button type="button" onClick={() => setUseRoundedTotal(false)}
                      className={`w-full flex justify-between items-center rounded-lg px-2.5 py-1.5 border-2 transition-colors ${!useRoundedTotal ? 'border-indigo-500 bg-indigo-50' : 'border-transparent hover:bg-gray-100'}`}>
                      <span className="text-xs font-medium text-gray-500">តម្លៃពិត</span>
                      <span className="font-bold text-gray-700">{fmtKHR(total)}</span>
                    </button>
                    <button type="button" onClick={() => setUseRoundedTotal(true)}
                      className={`w-full flex justify-between items-center rounded-lg px-2.5 py-1.5 border-2 transition-colors ${useRoundedTotal ? 'border-indigo-500 bg-indigo-50' : 'border-transparent hover:bg-gray-100'}`}>
                      <span className="text-xs font-medium text-gray-500">តម្លៃបង្គត់ <span className="text-[10px] text-indigo-400">(លំនាំដើម)</span></span>
                      <span className="font-bold text-gray-700">{fmtKHR(roundedTotal)}</span>
                    </button>
                  </div>
                ) : null}

                <div className="flex justify-between font-bold text-lg text-gray-800 pt-2 border-t border-gray-200"><span>សរុបទូទៅ:</span><span className="text-indigo-600">{fmtDisplay(effectiveTotal)}</span></div>
              </div>
            )}

            {/* Totals — BOTH mode: two SEPARATE, un-converted totals */}
            {displayCurrency === 'BOTH' && (
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-100">
                    <p className="text-xs text-blue-500 mb-1">ទំនិញជា ៛ (មិនបម្លែង)</p>
                    <p className="font-bold text-blue-700">{fmtKHR(effectiveTotalKhrBoth)}</p>
                    {discountKhr > 0 && <p className="text-[10px] text-blue-400 mt-0.5">បញ្ចុះ: −{fmtKHR(discountKhr)}</p>}
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center border border-green-100">
                    <p className="text-xs text-green-500 mb-1">ទំនិញជា $ (មិនបម្លែង)</p>
                    <p className="font-bold text-green-700">{fmtUSD(totalUsdBoth)}</p>
                    {discountUsd > 0 && <p className="text-[10px] text-green-400 mt-0.5">បញ្ចុះ: −{fmtUSD(discountUsd)}</p>}
                  </div>
                </div>

                {/* Real vs Rounded KHR total picker */}
                <button type="button" onClick={() => setUseRoundedTotal(v => !v)}
                  className="w-full flex justify-between items-center rounded-lg px-2.5 py-1.5 border-2 border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50">
                  <span className="text-[11px] font-medium text-gray-500">
                    ៛ តម្លៃពិត {fmtKHR(totalKhrBoth)} → ប្រើ {useRoundedTotal ? 'តម្លៃបង្គត់' : 'តម្លៃពិត'}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${useRoundedTotal ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                    {useRoundedTotal ? 'បង្គត់ ✓' : 'ពិត'}
                  </span>
                </button>

                <p className="text-[10px] text-gray-400 text-center">ទាំងពីរនេះមិនត្រូវបានបូកបញ្ចូលគ្នាទេ — នីមួយៗរក្សាទុកដាច់ដោយឡែកក្នុងវិក្កយបត្រតែមួយ</p>
              </div>
            )}

            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-600">💳 ស្ថានភាពការទូទាត់</p>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { mode: 'paid',    icon: '✅', label: 'បានទូទាត់ពេញ',  cls: 'border-green-400 bg-green-500 text-white', inactive: 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50' },
                  { mode: 'deposit', icon: '💰', label: 'កក់មុន',          cls: 'border-orange-400 bg-orange-500 text-white', inactive: 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50' },
                  { mode: 'pending', icon: '⏳', label: 'មិនទាន់ទូទាត់', cls: 'border-red-400 bg-red-500 text-white', inactive: 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50' },
                ].map(({ mode, icon, label, cls, inactive }) => (
                  <button key={mode} type="button"
                    onClick={() => { setPaymentMode(mode); if (mode !== 'deposit') setDeposit('') }}
                    className={`py-3 rounded-xl text-xs font-bold border-2 transition-colors ${paymentMode === mode ? cls : inactive}`}>
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
                {paymentMode === 'paid'    && 'អតិថិជនបានបង់ពេញ — វិក្កយបត្រនឹងកត់ជា «បានទូទាត់» ហើយមិនបង្ហាញ «នៅខ្វះ» នៅលើការបោះពុម្ព'}
                {paymentMode === 'deposit' && 'អតិថិជនបង់ប្រាក់កក់ — ការបោះពុម្ពនឹងបង្ហាញ «កក់មុន» និង «នៅខ្វះ» ។ ប្រើ Telegram ឬ Detail page ដើម្បីកត់ការទូទាត់ថ្មី'}
                {paymentMode === 'pending' && 'អតិថិជនមិនទាន់បង់ — ការបោះពុម្ពនឹងបង្ហាញ «នៅខ្វះ» = សរុបទូទៅ មិនមានជួរ «កក់មុន»'}
              </div>

              {paymentMode === 'deposit' && (
                <div className="space-y-3 bg-orange-50 border border-orange-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-orange-700">អតិថិជនអាចបង់ជា ៛ ឬ $ — ប្រព័ន្ធគណនាបម្លែងស្វ័យប្រវត្តិ</p>

                  <div className="flex gap-2">
                    {[['KHR', '៛ រៀល'], ['USD', '$ ដុល្លារ']].map(([val, label]) => (
                      <button key={val} type="button"
                        onClick={() => setDepositCurrency(val)}
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

                  {displayCurrency !== 'BOTH' && effectiveTotal > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {[25, 50, 75].map(pct => {
                        const base = depositCurrency === displayCurrency
                          ? effectiveTotal * pct / 100
                          : toDisplay(effectiveTotal * pct / 100, displayCurrency, depositCurrency)
                        return (
                          <button key={pct} onClick={() => setDeposit(depositCurrency === 'USD' ? +base.toFixed(2) : Math.round(base))}
                            className="flex-1 min-w-[60px] py-1.5 text-xs font-semibold rounded-lg bg-white border-2 border-orange-200 text-orange-600 hover:bg-orange-100">{pct}%
                          </button>
                        )
                      })}
                      <button onClick={() => {
                        const full = depositCurrency === displayCurrency ? effectiveTotal : toDisplay(effectiveTotal, displayCurrency, depositCurrency)
                        setDeposit(depositCurrency === 'USD' ? +full.toFixed(2) : Math.round(full))
                      }} className="flex-1 min-w-[60px] py-1.5 text-xs font-semibold rounded-lg bg-orange-500 text-white hover:bg-orange-600">ពេញ</button>
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

            <button onClick={submit} disabled={submitting || cart.length === 0}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold text-base transition-colors shadow-md">
              {submitting ? 'កំពុងរក្សា...' : `✅ បង្កើតវិក្កយបត្រ${pageCount > 1 && displayCurrency !== 'BOTH' ? ` (${pageCount} ទំព័រ)` : ''} + ផ្ញើ Telegram`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}