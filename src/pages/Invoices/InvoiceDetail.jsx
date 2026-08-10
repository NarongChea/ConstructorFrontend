import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useReactToPrint } from 'react-to-print'
import toast from 'react-hot-toast'
import { invoiceAPI } from '../../api/index.js'
import { formatCurrency, formatDateTime, INVOICE_STATUS } from '../../utils/formatters.js'
import { PageLoader, FormField } from '../../components/UI/index.jsx'
import Modal from '../../components/UI/Modal.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import { sendOrderToTelegram } from '../../utils/telegram.js'

const PRINT_STYLE = `
@media print {
  @page { size: A3 portrait; margin: 0mm; }
  html, body { margin: 0 !important; padding: 0 !important; }
  body * { visibility: hidden !important; }
  #inv-print, #inv-print * { visibility: visible !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  #inv-print { position: absolute !important; top: 0; left: 0; width: 297mm !important; }
  .no-print   { display: none !important; }
  .print-only { display: block !important; }
  .page-copy  { page-break-inside: avoid; break-inside: avoid; }
}
`

const B  = '#1a2c8a'
const LB = '#dde4f6'
const MIN_ROWS = 20

const CO = {
  badge: '168', name: 'សម្បត្តិ មហាសាល',
  sub:  'ផ្គត់ផ្គង់សំភារៈសំណង់ គ្រឿងអគ្គិសនី និងកិនភ្លីស័ង្កសី',
  addrLbl: 'អាសយដ្ឋាន', addr: 'ផ្សារបែកអន្លូង ស្រុកស្ទឹងត្រង់ ខេត្តកំពង់ចាម',
  tel1: '016 439 073', tel2: '012 439 073', tel3: '071 8 522 555',
}

const TH = {
  padding: '4mm 3mm', border: `1.5px solid ${B}`, fontWeight: '800',
  textAlign: 'center', whiteSpace: 'pre-line', lineHeight: 1.3,
  color: '#fff', fontSize: '15px',
}
const TD = {
  padding: '2.5mm 3mm', border: `1.5px solid ${B}`,
  height: '12mm', fontSize: '15px',
}

const fmtKHR = (n) => Math.round(n || 0).toLocaleString('km-KH') + ' ៛'
const fmtUSD = (n) => '$' + (n || 0).toFixed(2)
const fmtByCurrency = (n, currency) => currency === 'USD' ? fmtUSD(n) : fmtKHR(n)

// Round to the nearest real riel note/coin denomination (100៛), so a
// calculated 4,074៛ becomes something a cashier can actually hand over.
const roundKHR = (n, dir) => {
  const base = Math.round(Number(n) || 0)
  if (dir === 'up')   return Math.ceil(base / 100) * 100
  if (dir === 'down') return Math.floor(base / 100) * 100
  return Math.round(base / 100) * 100
}

function InvoiceCopy({ invoice, copyLabel }) {
  const items = invoice.items || []
  const rows  = [...items]
  while (rows.length < MIN_ROWS) rows.push(null)

  const d     = new Date(invoice.createdAt)
  const day   = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year  = d.getFullYear()
  const cust  = invoice.partnerName || invoice.customerName || ''
  const phone = invoice.customerPhone || ''

  const isBoth   = invoice.currency === 'BOTH'
  const isPaid   = invoice.status === 'paid'

  // ── Single-currency figures ──
  const totalAmt    = Number(invoice.total) || 0
  const depositAmt  = Number(invoice.depositAmount) || 0
  const remainingAmt = (invoice.remainingAmount !== undefined && invoice.remainingAmount !== null)
    ? Number(invoice.remainingAmount)
    : Math.max(0, totalAmt - depositAmt)
  const hasDeposit  = depositAmt > 0

  // ── BOTH-currency figures ──
  const totalKHR     = Number(invoice.totalKHR) || 0
  const totalUSD     = Number(invoice.totalUSD) || 0
  const depositKHR   = Number(invoice.depositKHR) || 0
  const depositUSD   = Number(invoice.depositUSD) || 0
  const remainingKHR = (invoice.remainingKHR !== undefined && invoice.remainingKHR !== null)
    ? Number(invoice.remainingKHR)
    : Math.max(0, totalKHR - depositKHR)
  const remainingUSD = (invoice.remainingUSD !== undefined && invoice.remainingUSD !== null)
    ? Number(invoice.remainingUSD)
    : Math.max(0, totalUSD - depositUSD)
  const hasDepositBoth = depositKHR > 0 || depositUSD > 0

  const balanceSingle = isPaid ? null : remainingAmt

  return (
    <div style={{ padding: '6mm 9mm', position: 'relative', boxSizing: 'border-box' }}>
      <div style={{ position: 'absolute', top: '6mm', right: '9mm', fontSize: '13px', color: B, fontWeight: '700', opacity: 0.5 }}>
        {copyLabel}
      </div>

      {/* Header */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '4mm' }}>
        <tbody><tr>
          <td style={{ width: '34mm', verticalAlign: 'middle' }}>
            <div style={{ width: '30mm', height: '30mm', border: `4px solid ${B}`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: LB }}>
              <div style={{ width: '23mm', height: '23mm', borderRadius: '50%', border: `2.5px dashed ${B}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '35px', fontWeight: '900', color: B }}>{CO.badge}</span>
              </div>
            </div>
          </td>
          <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '0 4mm' }}>
            <div style={{ fontSize: '40px', fontWeight: '900', color: B, letterSpacing: '0.5px', lineHeight: 1.1 }}>{CO.name}</div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: B, marginTop: '2mm', lineHeight: 1.3 }}>{CO.sub}</div>
            <div style={{ fontSize: '18px', color: B, marginTop: '1.5mm' }}>
              <span style={{ fontWeight: '700' }}>{CO.addrLbl}:&nbsp;</span>{CO.addr}
            </div>
          </td>
          <td style={{ width: '34mm' }} />
        </tr></tbody>
      </table>

      {/* Invoice number + title */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '4mm' }}>
        <tbody><tr>
          <td style={{ width: '65mm', verticalAlign: 'top', fontSize: '16px' }}>
            <div style={{ marginBottom: '2mm' }}>
              <b>N°:&nbsp;</b>
              <span style={{ borderBottom: `2px solid ${B}`, fontWeight: '700', paddingBottom: '0.5mm' }}>{invoice.invoiceNumber}</span>
            </div>
            <div style={{ fontSize : '20px'}}><b>Tel:</b>&nbsp;{CO.tel1}</div>
            <div style={{ fontSize : '20px'}}>📱&nbsp;{CO.tel2}</div>
            <div style={{ fontSize : '20px'}}>📱&nbsp;{CO.tel3}</div>
          </td>
          <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
            <div style={{ fontSize: '30px', fontWeight: '900', color: B, letterSpacing: '1px', lineHeight: 1.1 }}>វិក្កយបត្រ</div>
            <div style={{ fontSize: '15px', fontWeight: '700', letterSpacing: '6px', color: B, marginTop: '2mm' }}>INVOICE</div>
          </td>
          <td style={{ width: '65mm' }} />
        </tr></tbody>
      </table>

      {/* Customer row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: `2.5px solid ${B}`, paddingBottom: '2.5mm', fontSize: '14px', flexWrap: 'wrap', gap: '2mm' }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: '700' }}>អតិថិជន:&nbsp;</span>
          <span style={{ display: 'inline-block', minWidth: '80mm', borderBottom: `1px dotted ${B}`, paddingBottom: '0.3mm' }}>{cust}</span>
          {phone && <span style={{ marginLeft: '4mm' }}>📞&nbsp;{phone}</span>}
        </div>
        <div style={{ whiteSpace: 'nowrap', fontSize: '14px' }}>
          ថ្ងៃ&thinsp;<span style={{ borderBottom: `1px solid ${B}`, minWidth: '10mm', display: 'inline-block', textAlign: 'center' }}>{day}</span>
          &thinsp;ខែ&thinsp;<span style={{ borderBottom: `1px solid ${B}`, minWidth: '10mm', display: 'inline-block', textAlign: 'center' }}>{month}</span>
          &thinsp;ឆ្នាំ&thinsp;<span style={{ borderBottom: `1px solid ${B}`, minWidth: '16mm', display: 'inline-block', textAlign: 'center' }}>{year}</span>
        </div>
      </div>

      {/* Items table */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: B }}>
            <th style={{ ...TH, width: '12mm' }}>{'លរ\nNo'}</th>
            <th style={{ ...TH }}>{'បរិយាយ\nDescription'}</th>
            <th style={{ ...TH, width: '24mm' }}>{'ចំនួន\nQty'}</th>
            <th style={{ ...TH, width: '38mm' }}>{'តម្លៃ\nUnit Price'}</th>
            <th style={{ ...TH, width: '44mm' }}>{'តម្លៃសរុប\nAmount'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item, i) => {
            const itemCurrency = isBoth ? (item?.currency || 'KHR') : invoice.currency
            return (
              <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : LB }}>
                <td style={{ ...TD, textAlign: 'center', fontWeight: '700' }}>{i + 1}</td>
                <td style={{ ...TD }}>
                  {item
                    ? <><span style={{ fontWeight: '600' }}>{item.brand ? ` ${item.brand}` : item.brand}</span>
                        {item.unitValue ? <span style={{ color: '#777' }}> ({item.unitValue}{item.unit})</span> : ''}
                        {isBoth && <span style={{ color: '#999', fontSize: '11px' }}> [{itemCurrency}]</span>}</>
                    : <>&nbsp;</>}
                </td>
                <td style={{ ...TD, textAlign: 'center' }}>{item ? item.quantity : ''}</td>
                <td style={{ ...TD, textAlign: 'right' }}>{item ? fmtByCurrency(item.unitPrice, itemCurrency) : ''}</td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: item ? '700' : '400' }}>{item ? fmtByCurrency(item.subtotal, itemCurrency) : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Footer */}
      <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: `2.5px solid ${B}` }}>
        <tbody><tr>
          {/* Left: note + signatures */}
          <td style={{ border: `1.5px solid ${B}`, padding: '4mm', width: '57%', verticalAlign: 'top' }}>
            <div style={{ fontSize: '15px', lineHeight: 1.7, marginBottom: '6mm', fontWeight: '500' }}>
              <b style={{ fontSize: '16px' }}>*ចំណាំ:</b> ទំនិញដែលបានទិញរួចហើយ មិនអាចប្ដូរយកប្រាក់វិញបានទេ។
              {invoice.note && (
                <div style={{ marginTop: '2mm', fontStyle: 'italic', color: '#333' }}>📝 {invoice.note}</div>
              )}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody><tr>
                <td style={{ width: '50%', textAlign: 'center', paddingRight: '4mm' }}>
                  <div style={{ borderTop: `1.5px solid ${B}`, paddingTop: '2.5mm', marginTop: '20mm' }}>
                    <div style={{ fontWeight: '800', color: B, fontSize: '16px' }}>ហត្ថលេខាអ្នកទិញ</div>
                    <div style={{ color: '#777', fontSize: '13px', marginTop: '1mm' }}>Buyer Signature</div>
                  </div>
                </td>
                <td style={{ width: '50%', textAlign: 'center', paddingLeft: '4mm' }}>
                  <div style={{ borderTop: `1.5px solid ${B}`, paddingTop: '2.5mm', marginTop: '20mm' }}>
                    <div style={{ fontWeight: '800', color: B, fontSize: '16px' }}>ហត្ថលេខាអ្នកលក់</div>
                    <div style={{ color: '#777', fontSize: '13px', marginTop: '1mm' }}>Seller Signature</div>
                  </div>
                </td>
              </tr></tbody>
            </table>
          </td>

          {/* Right: totals */}
          <td style={{ border: `1.5px solid ${B}`, padding: 0, verticalAlign: 'top' }}>
            {isBoth ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '15px' }}>
                <tbody>
                  {(invoice.discountAmountKHR > 0 || invoice.discountAmountUSD > 0) && (<>
                    <tr style={{ borderBottom: `1px solid ${B}` }}>
                      <td style={{ padding: '3mm 4mm', fontWeight: '600', fontSize: '13px', color: '#555', borderRight: `1px solid ${B}` }}>សរុបរង</td>
                      <td style={{ padding: '3mm 4mm', textAlign: 'right', fontSize: '12px', color: '#555', borderRight: `1px dashed ${B}` }}>{invoice.subtotalKHR > 0 ? fmtKHR(invoice.subtotalKHR) : '—'}</td>
                      <td style={{ padding: '3mm 4mm', textAlign: 'right', fontSize: '12px', color: '#555' }}>{invoice.subtotalUSD > 0 ? fmtUSD(invoice.subtotalUSD) : '—'}</td>
                    </tr>
                    <tr style={{ borderBottom: `1px solid ${B}` }}>
                      <td style={{ padding: '3mm 4mm', color: 'red', fontSize: '13px', borderRight: `1px solid ${B}` }}>បញ្ចុះ</td>
                      <td style={{ padding: '3mm 4mm', textAlign: 'right', color: 'red', fontSize: '12px', borderRight: `1px dashed ${B}` }}>{invoice.discountAmountKHR > 0 ? `−${fmtKHR(invoice.discountAmountKHR)}` : '—'}</td>
                      <td style={{ padding: '3mm 4mm', textAlign: 'right', color: 'red', fontSize: '12px' }}>{invoice.discountAmountUSD > 0 ? `−${fmtUSD(invoice.discountAmountUSD)}` : '—'}</td>
                    </tr>
                  </>)}

                  <tr style={{ background: LB, borderBottom: `1px solid ${B}` }}>
                    <td style={{ padding: '2mm 4mm', borderRight: `1px solid ${B}` }}></td>
                    <td style={{ padding: '2mm 4mm', textAlign: 'center', fontWeight: '800', color: B, fontSize: '13px', borderRight: `1px dashed ${B}` }}>៛ រៀល</td>
                    <td style={{ padding: '2mm 4mm', textAlign: 'center', fontWeight: '800', color: B, fontSize: '13px' }}>$ ដុល្លារ</td>
                  </tr>

                  <tr style={{ borderBottom: `1px solid ${B}`, background: LB }}>
                    <td style={{ padding: '4mm', fontWeight: '900', fontSize: '17px', color: B, borderRight: `1px solid ${B}` }}>សរុប/TOTAL</td>
                    <td style={{ padding: '4mm', textAlign: 'right', fontWeight: '900', fontSize: '16px', color: B, borderRight: `1px dashed ${B}` }}>{fmtKHR(totalKHR)}</td>
                    <td style={{ padding: '4mm', textAlign: 'right', fontWeight: '900', fontSize: '16px', color: B }}>{fmtUSD(totalUSD)}</td>
                  </tr>

                  <tr style={{ borderBottom: `1px solid ${B}` }}>
                    <td style={{ padding: '4mm', fontWeight: '700', fontSize: '15px', borderRight: `1px solid ${B}` }}>កក់មុន/DEPOSIT</td>
                    <td style={{ padding: '4mm', textAlign: 'right', fontWeight: '700', borderRight: `1px dashed ${B}`, color: depositKHR > 0 ? '#1a7a3a' : '#999' }}>
                      {depositKHR > 0 ? `−${fmtKHR(depositKHR)}` : '—'}
                    </td>
                    <td style={{ padding: '4mm', textAlign: 'right', fontWeight: '700', color: depositUSD > 0 ? '#1a7a3a' : '#999' }}>
                      {depositUSD > 0 ? `−${fmtUSD(depositUSD)}` : '—'}
                    </td>
                  </tr>

                  {(!isPaid || hasDepositBoth) && (
                    <tr>
                      <td style={{ padding: '4mm', fontWeight: '900', fontSize: '18px', color: B, borderRight: `1px solid ${B}` }}>នៅខ្វះ/BALANCE</td>
                      <td style={{ padding: '4mm', textAlign: 'right', fontWeight: '900', fontSize: '17px', borderRight: `1px dashed ${B}`,
                        color: remainingKHR === 0 ? '#1a7a3a' : 'red' }}>
                        {remainingKHR === 0 ? '✓ បានបង់ពេញ' : fmtKHR(remainingKHR)}
                      </td>
                      <td style={{ padding: '4mm', textAlign: 'right', fontWeight: '900', fontSize: '17px',
                        color: remainingUSD === 0 ? '#1a7a3a' : 'red' }}>
                        {remainingUSD === 0 ? '✓ បានបង់ពេញ' : fmtUSD(remainingUSD)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '15px' }}>
                <tbody>
                  {invoice.discountAmount > 0 && (<>
                    <tr style={{ borderBottom: `1px solid ${B}` }}>
                      <td style={{ padding: '3mm 4mm', fontWeight: '600' }}>សរុបរង</td>
                      <td style={{ padding: '3mm 4mm', textAlign: 'right' }}>{fmtByCurrency(invoice.subtotal, invoice.currency)}</td>
                    </tr>
                    <tr style={{ borderBottom: `1px solid ${B}` }}>
                      <td style={{ padding: '3mm 4mm', color: 'red' }}>បញ្ចុះ</td>
                      <td style={{ padding: '3mm 4mm', textAlign: 'right', color: 'red' }}>-{fmtByCurrency(invoice.discountAmount, invoice.currency)}</td>
                    </tr>
                  </>)}

                  <tr style={{ borderBottom: `1px solid ${B}`, background: LB }}>
                    <td style={{ padding: '4mm', fontWeight: '900', fontSize: '17px', color: B }}>សរុប/TOTAL</td>
                    <td style={{ padding: '4mm', textAlign: 'right', fontWeight: '900', fontSize: '17px', color: B }}>{fmtByCurrency(totalAmt, invoice.currency)}</td>
                  </tr>

                  <tr style={{ borderBottom: `1px solid ${B}` }}>
                    <td style={{ padding: '4mm', fontWeight: '700', fontSize: '15px' }}>កក់មុន/DEPOSIT</td>
                    <td style={{ padding: '4mm', textAlign: 'right', fontWeight: '700', color: '#1a7a3a' }}>
                      {hasDeposit && ("-"+fmtByCurrency(depositAmt, invoice.currency))}
                    </td>
                  </tr>

                  <tr>
                    <td style={{ padding: '4mm', fontWeight: '900', fontSize: '18px', color: B }}>នៅខ្វះ/BALANCE</td>
                    <td style={{ padding: '4mm', textAlign: 'right', fontWeight: '900', fontSize: '18px',
                      color: balanceSingle === 0 ? '#1a7a3a' : 'red' }}>
                    {(!isPaid || hasDeposit) && (
                      balanceSingle === 0
                        ? '✓ បានបង់ពេញ'
                        : fmtByCurrency(balanceSingle, invoice.currency))}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </td>
        </tr></tbody>
      </table>
    </div>
  )
}

export default function InvoiceDetail() {
  const { id } = useParams()
  const [invoice,       setInvoice]       = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [sending,       setSending]       = useState(false)
  const printRef = useRef()

  const [showPayment,    setShowPayment]    = useState(false)
  const [payAmount,      setPayAmount]      = useState('')
  const [payCurrency,    setPayCurrency]    = useState('KHR')
  const [paySaving,      setPaySaving]      = useState(false)
  const [notPaidConfirm, setNotPaidConfirm] = useState(false)

  // ── Pre-print adjustment — lets the printed totals be rounded to real
  //    riel denominations (e.g. 4,074៛ → 4,100៛) without touching the
  //    saved invoice data in the database. Only affects what gets printed. ──
  const [showAdjust, setShowAdjust] = useState(false)
  const [printOverrides, setPrintOverrides] = useState({
    total: '', deposit: '', remaining: '',
    totalKHR: '', totalUSD: '', depositKHR: '', depositUSD: '', remainingKHR: '', remainingUSD: '',
  })

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    print: async (printIframe) => {
      const doc = printIframe.contentDocument
      if (doc) {
        const style = doc.createElement('style')
        style.textContent = `@page { size: A3 portrait; margin: 0mm; } .print-only { display: block !important; }`
        doc.head.appendChild(style)
      }
      printIframe.contentWindow?.print()
    },
    onAfterPrint: async () => {
      await invoiceAPI.markPrinted(id)
      if (invoice) {
        const ok = await sendOrderToTelegram(invoice, 'បោះពុម្ព')
        if (ok) toast.success('📨 បានផ្ញើទៅ Telegram')
      }
    },
  })

  const handleSendTelegram = async () => {
    if (!invoice) return
    setSending(true)
    const ok = await sendOrderToTelegram(invoice, 'ផ្ញើម្ដងទៀត')
    if (ok) toast.success('📨 បានផ្ញើទៅ Telegram ដោយជោគជ័យ!')
    else    toast.error('មានបញ្ហាក្នុងការផ្ញើ Telegram')
    setSending(false)
  }

  const loadInvoice = () => {
    setLoading(true)
    invoiceAPI.get(id).then(r => setInvoice(r.data)).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { loadInvoice() }, [id])

  const cancelInvoice = async () => {
    await invoiceAPI.updateStatus(id, 'cancelled')
    toast.success('វិក្កយបត្របានបោះបង់')
    setCancelConfirm(false)
    setInvoice(p => ({ ...p, status: 'cancelled' }))
  }

  const openPaymentModal = () => {
    setPayAmount('')
    setPayCurrency(invoice?.currency === 'USD' ? 'USD' : 'KHR')
    setShowPayment(true)
  }

  const handleRecordPayment = async () => {
    const amt = Number(payAmount)
    if (!amt || amt <= 0) { toast.error('សូមបញ្ចូលចំនួនទឹកប្រាក់'); return }
    setPaySaving(true)
    try {
      const previousInputInThisCurrency = invoice.depositInputCurrency === payCurrency
        ? Number(invoice.depositInputAmount) || 0
        : 0
      const newInputAmount = previousInputInThisCurrency + amt
      await invoiceAPI.update(id, {
        depositInputAmount: newInputAmount,
        depositInputCurrency: payCurrency,
      })
      toast.success(`✅ បានកត់ត្រាការទូទាត់ ${payCurrency === 'USD' ? fmtUSD(amt) : fmtKHR(amt)}`)
      setShowPayment(false)
      loadInvoice()
    } catch (err) {
      toast.error(err?.response?.data?.message || 'មានបញ្ហា')
    } finally { setPaySaving(false) }
  }

  const handleMarkNotPaid = async () => {
    setPaySaving(true)
    try {
      await invoiceAPI.update(id, {
        depositInputAmount: 0,
        depositInputCurrency: null,
        status: 'pending',
      })
      toast.success('✅ បានកំណត់ជា «មិនទាន់ទូទាត់»')
      setNotPaidConfirm(false)
      loadInvoice()
    } catch {
      toast.error('មានបញ្ហា')
    } finally { setPaySaving(false) }
  }

  if (loading) return <PageLoader />
  if (!invoice) return <div className="card p-8 text-center text-gray-400">រកមិនឃើញ</div>

  const st   = INVOICE_STATUS[invoice?.status] || INVOICE_STATUS.pending
  const cust = invoice?.partnerName || invoice?.customerName || ''
  const isBoth      = invoice?.currency === 'BOTH'
  const isFullyPaid = invoice?.status === 'paid'
  const isCancelled = invoice?.status === 'cancelled'
  const isPending   = invoice?.status === 'pending'

  // Single-currency
  const depositAmt = Number(invoice?.depositAmount) || 0
  const totalAmt   = Number(invoice?.total) || 0
  const remaining  = (isFullyPaid || isCancelled)
    ? 0
    : (invoice?.remainingAmount !== undefined && invoice?.remainingAmount !== null)
      ? Number(invoice.remainingAmount)
      : Math.max(0, totalAmt - depositAmt)
  const hasDeposit = depositAmt > 0

  // BOTH
  const totalKHR   = Number(invoice?.totalKHR) || 0
  const totalUSD   = Number(invoice?.totalUSD) || 0
  const depositKHR = Number(invoice?.depositKHR) || 0
  const depositUSD = Number(invoice?.depositUSD) || 0
  const remainingKHR = (isFullyPaid || isCancelled)
    ? 0
    : (invoice?.remainingKHR !== undefined && invoice?.remainingKHR !== null)
      ? Number(invoice.remainingKHR)
      : Math.max(0, totalKHR - depositKHR)
  const remainingUSD = (isFullyPaid || isCancelled)
    ? 0
    : (invoice?.remainingUSD !== undefined && invoice?.remainingUSD !== null)
      ? Number(invoice.remainingUSD)
      : Math.max(0, totalUSD - depositUSD)
  const hasDepositBoth = depositKHR > 0 || depositUSD > 0

  const canRecordPayment = isBoth
    ? (!isCancelled && !isFullyPaid && (remainingKHR > 0 || remainingUSD > 0))
    : (!isCancelled && !isFullyPaid)
  const canMarkNotPaid = !isCancelled && !isPending

  // ── Build the invoice object actually used for printing: any field the
  //    user edited in the Adjust modal overrides the real calculated value. ──
  const buildDisplayInvoice = () => {
    const fieldMap = isBoth
      ? { totalKHR: 'totalKHR', totalUSD: 'totalUSD', depositKHR: 'depositKHR', depositUSD: 'depositUSD', remainingKHR: 'remainingKHR', remainingUSD: 'remainingUSD' }
      : { total: 'total', deposit: 'depositAmount', remaining: 'remainingAmount' }
    const patch = {}
    Object.entries(fieldMap).forEach(([overrideKey, invoiceField]) => {
      const raw = printOverrides[overrideKey]
      if (raw !== '' && raw !== null && raw !== undefined && !Number.isNaN(Number(raw))) {
        patch[invoiceField] = Number(raw)
      }
    })
    return { ...invoice, ...patch }
  }
  const displayInvoice = buildDisplayInvoice()
  const hasAnyOverride = Object.values(printOverrides).some(v => v !== '')

  const openAdjustModal = () => {
    // Prefill with the current calculated numbers so editing means tweaking,
    // not typing everything from scratch.
    setPrintOverrides(isBoth
      ? {
          total: '', deposit: '', remaining: '',
          totalKHR: String(totalKHR), totalUSD: String(totalUSD.toFixed(2)),
          depositKHR: String(depositKHR), depositUSD: String(depositUSD.toFixed(2)),
          remainingKHR: String(remainingKHR), remainingUSD: String(remainingUSD.toFixed(2)),
        }
      : {
          total: String(totalAmt), deposit: String(depositAmt), remaining: String(remaining),
          totalKHR: '', totalUSD: '', depositKHR: '', depositUSD: '', remainingKHR: '', remainingUSD: '',
        })
    setShowAdjust(true)
  }

  const resetOverrides = () => {
    setPrintOverrides({
      total: '', deposit: '', remaining: '',
      totalKHR: '', totalUSD: '', depositKHR: '', depositUSD: '', remainingKHR: '', remainingUSD: '',
    })
  }

  const setOverride = (key, val) => setPrintOverrides(prev => ({ ...prev, [key]: val }))
  const roundOverride = (key, dir) => setPrintOverrides(prev => ({ ...prev, [key]: String(roundKHR(prev[key], dir)) }))

  const confirmAdjustAndPrint = () => {
    setShowAdjust(false)
    // Slight delay so state settles into displayInvoice before the iframe clones it
    setTimeout(() => handlePrint(), 50)
  }

  return (
    <div className="space-y-4">
      <style>{PRINT_STYLE}</style>

      {/* Action bar */}
      <div className="flex items-center gap-2 no-print flex-wrap">
        <Link to="/invoices" className="btn-secondary text-sm">← ត្រឡប់</Link>
        <Link to={`/invoices/${id}/edit`} className="btn-secondary text-sm">✏️ កែប្រែ</Link>
        <div className="flex-1" />
        <span className={`${st.cls} text-sm px-3 py-1.5`}>{st.label}</span>
        {isBoth && <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700 font-semibold">៛ + $ ដាច់ដោយឡែក</span>}
        {hasAnyOverride && <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-semibold">✏️ តម្លៃបានកែសម្រាប់បោះពុម្ព</span>}

        {canRecordPayment && (
          <button onClick={openPaymentModal}
            className="btn-secondary text-sm bg-green-50 text-green-700 border-green-200 hover:bg-green-100">
            💵 កត់ត្រាការទូទាត់
          </button>
        )}
        {canMarkNotPaid && (
          <button onClick={() => setNotPaidConfirm(true)} disabled={paySaving}
            className="btn-secondary text-sm bg-red-50 text-red-600 border-red-200 hover:bg-red-100">
            ⏳ មិនទាន់ទូទាត់
          </button>
        )}
        <button onClick={handleSendTelegram} disabled={sending}
          className="btn-secondary text-sm bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100">
          {sending ? '📨...' : '📨 ផ្ញើ Telegram'}
        </button>
        {!isCancelled && (
          <button onClick={() => setCancelConfirm(true)} className="btn-danger text-sm">🚫 បោះបង់</button>
        )}
        <button onClick={openAdjustModal} className="btn-primary text-sm">🖨️ បោះពុម្ព / PDF</button>
      </div>

      {/* Printable invoice — uses displayInvoice so print-only overrides apply */}
      <div style={{ overflowX: 'auto' }}>
        <div id="inv-print" ref={printRef} style={{
          fontFamily: "'Khmer OS Battambang','Hanuman','Noto Sans Khmer',sans-serif",
          color: B, background: '#fff', width: '297mm', margin: '0 auto',
          boxSizing: 'border-box', fontSize: '15px', lineHeight: 1.4,
          boxShadow: '0 4px 32px rgba(0,0,0,0.12)', overflow: 'visible',
        }}>
          <div style={{ pageBreakAfter: 'always', breakAfter: 'page' }}>
            <InvoiceCopy invoice={displayInvoice} copyLabel="អតិថិជន / Customer Copy" />
          </div>
          <div className="print-only">
            <InvoiceCopy invoice={displayInvoice} copyLabel="ហាង / Shop Copy" />
          </div>
        </div>
      </div>

      {/* Screen summary */}
      <div className="card p-4 no-print">
        <div className="flex gap-6 text-sm flex-wrap">
          <div><span className="text-gray-400">លេខ:</span> <span className="font-mono font-semibold">{invoice?.invoiceNumber ?? '—'}</span></div>
          <div><span className="text-gray-400">អតិថិជន:</span> <span className="font-semibold">{cust || '—'}</span></div>
          <div><span className="text-gray-400">ថ្ងៃបង្កើត:</span> <span>{invoice?.createdAt ? formatDateTime(invoice.createdAt) : '—'}</span></div>

          {!isBoth && <>
            <div><span className="text-gray-400">សរុប:</span> <span className="font-bold text-indigo-600">{fmtByCurrency(totalAmt, invoice.currency)}</span></div>
            {isFullyPaid && !hasDeposit && (
              <div><span className="font-bold text-green-600">✓ បានបង់ពេញ</span></div>
            )}
            {hasDeposit && <>
              <div><span className="text-gray-400">បានបង់:</span> <span className="font-bold text-green-600">{fmtByCurrency(depositAmt, invoice.currency)}</span></div>
              <div><span className="text-gray-400">នៅខ្វះ:</span>
                <span className={`font-bold ml-1 ${remaining === 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {remaining === 0 ? '✓ បានបង់ពេញ' : fmtByCurrency(remaining, invoice.currency)}
                </span>
              </div>
            </>}
          </>}

          {isBoth && <>
            <div><span className="text-gray-400">សរុប ៛:</span> <span className="font-bold text-blue-600">{fmtKHR(totalKHR)}</span></div>
            <div><span className="text-gray-400">សរុប $:</span> <span className="font-bold text-green-600">{fmtUSD(totalUSD)}</span></div>
            {isFullyPaid && !hasDepositBoth && (
              <div><span className="font-bold text-green-600">✓ បានបង់ពេញ</span></div>
            )}
            {hasDepositBoth && <>
              <div><span className="text-gray-400">បានបង់ ៛:</span> <span className="font-bold text-green-600">{fmtKHR(depositKHR)}</span></div>
              <div><span className="text-gray-400">បានបង់ $:</span> <span className="font-bold text-green-600">{fmtUSD(depositUSD)}</span></div>
              <div><span className="text-gray-400">នៅខ្វះ ៛:</span>
                <span className={`font-bold ml-1 ${remainingKHR === 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {remainingKHR === 0 ? '✓' : fmtKHR(remainingKHR)}
                </span>
              </div>
              <div><span className="text-gray-400">នៅខ្វះ $:</span>
                <span className={`font-bold ml-1 ${remainingUSD === 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {remainingUSD === 0 ? '✓' : fmtUSD(remainingUSD)}
                </span>
              </div>
            </>}
          </>}

          {invoice?.updatedAt && invoice.updatedAt !== invoice.createdAt && (
            <div><span className="text-gray-400">កែប្រែចុងក្រោយ:</span> <span>{formatDateTime(invoice.updatedAt)}</span></div>
          )}
        </div>
      </div>

      {/* ── Adjust-before-print modal ── */}
      <Modal open={showAdjust} onClose={() => setShowAdjust(false)} title="✏️ កែតម្លៃមុនបោះពុម្ព" size="sm">
        <div className="space-y-4">
          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            កែលេខទាំងនេះសម្រាប់តែការបោះពុម្ពប៉ុណ្ណោះ — ទិន្នន័យវិក្កយបត្រដើមនៅក្នុងប្រព័ន្ធមិនប្រែប្រួលទេ។ ប្រើប៊ូតុង ⤴⤵ ដើម្បីបង្គត់ទៅជាចំនួនប្រាក់រៀលពិត (រាល់ 100៛)។
          </p>

          {!isBoth ? (
            <div className="space-y-3">
              <FormField label="សរុប (Total)">
                <div className="flex gap-2">
                  <input type="number" className="input-field flex-1" value={printOverrides.total}
                    onChange={e => setOverride('total', e.target.value)} />
                  {invoice.currency !== 'USD' && <>
                    <button onClick={() => roundOverride('total', 'down')} className="px-2 border-2 border-gray-200 rounded-lg text-xs">⤵</button>
                    <button onClick={() => roundOverride('total', 'up')} className="px-2 border-2 border-gray-200 rounded-lg text-xs">⤴</button>
                  </>}
                </div>
              </FormField>
              <FormField label="បានបង់ (Deposit)">
                <div className="flex gap-2">
                  <input type="number" className="input-field flex-1" value={printOverrides.deposit}
                    onChange={e => setOverride('deposit', e.target.value)} />
                  {invoice.currency !== 'USD' && <>
                    <button onClick={() => roundOverride('deposit', 'down')} className="px-2 border-2 border-gray-200 rounded-lg text-xs">⤵</button>
                    <button onClick={() => roundOverride('deposit', 'up')} className="px-2 border-2 border-gray-200 rounded-lg text-xs">⤴</button>
                  </>}
                </div>
              </FormField>
              <FormField label="នៅខ្វះ (Balance)">
                <div className="flex gap-2">
                  <input type="number" className="input-field flex-1" value={printOverrides.remaining}
                    onChange={e => setOverride('remaining', e.target.value)} />
                  {invoice.currency !== 'USD' && <>
                    <button onClick={() => roundOverride('remaining', 'down')} className="px-2 border-2 border-gray-200 rounded-lg text-xs">⤵</button>
                    <button onClick={() => roundOverride('remaining', 'up')} className="px-2 border-2 border-gray-200 rounded-lg text-xs">⤴</button>
                  </>}
                </div>
              </FormField>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-blue-600 mb-2">៛ រៀល</p>
                <div className="space-y-2">
                  <FormField label="សរុប ៛">
                    <div className="flex gap-2">
                      <input type="number" className="input-field flex-1" value={printOverrides.totalKHR} onChange={e => setOverride('totalKHR', e.target.value)} />
                      <button onClick={() => roundOverride('totalKHR', 'down')} className="px-2 border-2 border-gray-200 rounded-lg text-xs">⤵</button>
                      <button onClick={() => roundOverride('totalKHR', 'up')} className="px-2 border-2 border-gray-200 rounded-lg text-xs">⤴</button>
                    </div>
                  </FormField>
                  <FormField label="បានបង់ ៛">
                    <div className="flex gap-2">
                      <input type="number" className="input-field flex-1" value={printOverrides.depositKHR} onChange={e => setOverride('depositKHR', e.target.value)} />
                      <button onClick={() => roundOverride('depositKHR', 'down')} className="px-2 border-2 border-gray-200 rounded-lg text-xs">⤵</button>
                      <button onClick={() => roundOverride('depositKHR', 'up')} className="px-2 border-2 border-gray-200 rounded-lg text-xs">⤴</button>
                    </div>
                  </FormField>
                  <FormField label="នៅខ្វះ ៛">
                    <div className="flex gap-2">
                      <input type="number" className="input-field flex-1" value={printOverrides.remainingKHR} onChange={e => setOverride('remainingKHR', e.target.value)} />
                      <button onClick={() => roundOverride('remainingKHR', 'down')} className="px-2 border-2 border-gray-200 rounded-lg text-xs">⤵</button>
                      <button onClick={() => roundOverride('remainingKHR', 'up')} className="px-2 border-2 border-gray-200 rounded-lg text-xs">⤴</button>
                    </div>
                  </FormField>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-green-600 mb-2">$ ដុល្លារ</p>
                <div className="space-y-2">
                  <FormField label="សរុប $">
                    <input type="number" step="0.01" className="input-field" value={printOverrides.totalUSD} onChange={e => setOverride('totalUSD', e.target.value)} />
                  </FormField>
                  <FormField label="បានបង់ $">
                    <input type="number" step="0.01" className="input-field" value={printOverrides.depositUSD} onChange={e => setOverride('depositUSD', e.target.value)} />
                  </FormField>
                  <FormField label="នៅខ្វះ $">
                    <input type="number" step="0.01" className="input-field" value={printOverrides.remainingUSD} onChange={e => setOverride('remainingUSD', e.target.value)} />
                  </FormField>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center pt-2 border-t">
            <button onClick={resetOverrides} className="text-xs text-gray-400 hover:text-gray-600 font-medium">↺ សុទ្ធតាមគណនា</button>
            <div className="flex gap-2">
              <button onClick={() => setShowAdjust(false)} className="btn-secondary">បោះបង់</button>
              <button onClick={confirmAdjustAndPrint} className="btn-primary">🖨️ បន្តទៅបោះពុម្ព</button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Record Payment Modal */}
      <Modal open={showPayment} onClose={() => setShowPayment(false)} title="កត់ត្រាការទូទាត់" size="sm">
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
            <p>លេខវិក្កយបត្រ: <span className="font-mono font-semibold">{invoice.invoiceNumber}</span></p>
            {!isBoth ? (
              <>
                <p>សរុបទូទៅ: <span className="font-semibold">{fmtByCurrency(totalAmt, invoice.currency)}</span></p>
                <p>បានបង់រួច: <span className="font-semibold text-green-600">{fmtByCurrency(depositAmt, invoice.currency)}</span></p>
                <p>នៅខ្វះ: <span className="font-semibold text-red-600">{fmtByCurrency(remaining, invoice.currency)}</span></p>
              </>
            ) : (
              <>
                <p>នៅខ្វះ ៛: <span className="font-semibold text-red-600">{fmtKHR(remainingKHR)}</span></p>
                <p>នៅខ្វះ $: <span className="font-semibold text-red-600">{fmtUSD(remainingUSD)}</span></p>
              </>
            )}
          </div>

          <FormField label="អតិថិជនបង់ជា" required>
            <div className="flex gap-2">
              {[['KHR', '៛ រៀល'], ['USD', '$ ដុល្លារ']].map(([val, label]) => (
                <button key={val} type="button" onClick={() => setPayCurrency(val)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${payCurrency === val ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                  {label}
                </button>
              ))}
            </div>
          </FormField>

          <FormField label={`ចំនួនទូទាត់លើកនេះ (${payCurrency === 'USD' ? 'USD $' : 'រៀល ៛'})`} required>
            <input type="number" min="0" step={payCurrency === 'USD' ? '0.01' : '100'} className="input-field"
              value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0" autoFocus />
          </FormField>

          {!isBoth && payCurrency === invoice.currency && remaining > 0 && (
            <button onClick={() => setPayAmount(payCurrency === 'USD' ? remaining.toFixed(2) : String(Math.round(remaining)))}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
              បំពេញពេញ ({fmtByCurrency(remaining, invoice.currency)})
            </button>
          )}

          {isBoth && (
            <p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
              ℹ️ ប្រាក់នេះនឹងបង់ផ្នែក {payCurrency === 'USD' ? '$' : '៛'} ជាមុនសិន ប្រសិនបើនៅសល់ វានឹងបម្លែង ហើយយកទៅបង់ផ្នែក {payCurrency === 'USD' ? '៛' : '$'} ផងដែរ
            </p>
          )}

          <p className="text-xs text-gray-400">⏰ ការទូទាត់នេះនឹងកត់ត្រាជា៖ {formatDateTime(new Date())}</p>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button onClick={() => setShowPayment(false)} className="btn-secondary">បោះបង់</button>
            <button onClick={handleRecordPayment} disabled={paySaving || !Number(payAmount)} className="btn-primary">
              {paySaving ? 'កំពុងរក្សា...' : '✅ កត់ត្រាការទូទាត់'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={cancelConfirm}
        onClose={() => setCancelConfirm(false)}
        onConfirm={cancelInvoice}
        title="⚠️ បោះបង់វិក្កយបត្រ"
        message={`តើអ្នកប្រាកដចង់បោះបង់វិក្កយបត្រ ${invoice?.invoiceNumber} នេះ?\n\nស្ទុំទាំងអស់នឹងត្រូវបានដាក់ស្ដារវិញ ហើយការបោះបង់មិនអាចត្រឡប់វិញបានទេ។`}
      />
      <ConfirmDialog
        open={notPaidConfirm}
        onClose={() => setNotPaidConfirm(false)}
        onConfirm={handleMarkNotPaid}
        title="⚠️ កំណត់ជា «មិនទាន់ទូទាត់»"
        message={
          isBoth
            ? `តើអ្នកប្រាកដចង់កំណត់វិក្កយបត្រ ${invoice?.invoiceNumber} ជា «មិនទាន់ទូទាត់»?\n\nការកត់ប្រាក់កក់ទាំងពីរ (${fmtKHR(depositKHR)} និង ${fmtUSD(depositUSD)}) នឹងត្រូវបានលុប ហើយស្ថានភាពនឹងត្រូវវិលជា «pending»។`
            : `តើអ្នកប្រាកដចង់កំណត់វិក្កយបត្រ ${invoice?.invoiceNumber} ជា «មិនទាន់ទូទាត់»?\n\nការកត់ប្រាក់កក់ (${fmtByCurrency(depositAmt, invoice.currency)}) នឹងត្រូវបានលុប ហើយស្ថានភាពនឹងត្រូវវិលជា «pending»។`
        }
      />
    </div>
  )
}