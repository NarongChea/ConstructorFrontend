import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { invoiceAPI } from '../../api/index.js'
import { formatCurrency, formatDateTime, INVOICE_STATUS } from '../../utils/formatters.js'
import { PageLoader, FormField } from '../../components/UI/index.jsx'
import Modal from '../../components/UI/Modal.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import { sendOrderToTelegram } from '../../utils/telegram.js'

// ── PAPER: A5 portrait (148mm x 210mm). Margin kept narrow (3mm) so the
//    printout uses close to the full sheet. NOTE: the browser (Chrome/Edge/etc.)
//    still adds its own header/footer line (URL + date + page number) at the
//    top/bottom of the printed page — that is NOT controlled by this CSS.
//    To remove it, in the print dialog open "More settings" and uncheck
//    "Headers and footers" before printing/saving as PDF. ──
const PRINT_STYLE = `
@media print {
  @page { size: A5 portrait; margin: 3mm; }
  html, body { margin: 0 !important; padding: 0 !important; }
  body * { visibility: hidden !important; }
  #inv-print, #inv-print * { visibility: visible !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  #inv-print { position: absolute !important; top: 0; left: 0; width: 100% !important; max-width: 148mm !important; }
  .no-print   { display: none !important; }
  .print-only { display: block !important; }
  .page-copy  { page-break-inside: avoid; break-inside: avoid; }
}
`

const B  = '#1a2c8a'
// Previously a light-blue accent used for the badge circle, zebra-striped rows,
// and the highlighted totals/currency-header rows. Set to white per request —
// every place that referenced LB now renders plain white instead of light blue.
const LB = '#ffffff'

// ── Max rows printed on a single physical page. A5 is much smaller than the
//    old A3 layout, so this is far lower than before. Any invoice with more
//    items than this gets split across multiple pages per copy (each copy —
//    customer and shop — repeats this pagination). Row numbering (No column)
//    keeps counting across pages via `startIndex`; totals/footer only render
//    on the LAST page of each copy so the total isn't printed multiple times.
//    If rows still overflow the page in your printer/PDF preview, lower this
//    number further (try 6 or 7). ──
const ROWS_PER_PAGE = 8

const CO = {
  badge: '168', name: 'សម្បត្តិ មហាសាល',
  sub:  'ផ្គត់ផ្គង់សំភារៈសំណង់ គ្រឿងអគ្គិសនី និងកិនភ្លីស័ង្កសី',
  addrLbl: 'អាសយដ្ឋាន', addr: 'ផ្សារបែកអន្លូង ស្រុកស្ទឹងត្រង់ ខេត្តកំពង់ចាម',
  tel1: '016 439 073', tel2: '012 439 073', tel3: '071 8 522 555',
}

const TH = {
  padding: '1.5mm 1mm', border: `1px solid ${B}`, fontWeight: '700',
  textAlign: 'center', whiteSpace: 'pre-line', lineHeight: 1.2,
  color: '#fff', fontSize: '8px',
}
const TD = {
  padding: '1mm 1mm', border: `1px solid ${B}`,
  height: '5.5mm', fontSize: '8px',
}

const fmtKHR = (n) => Math.round(n || 0).toLocaleString('km-KH') + ' ៛'
const fmtUSD = (n) => '$' + (n || 0).toFixed(2)
const fmtByCurrency = (n, currency) => currency === 'USD' ? fmtUSD(n) : fmtKHR(n)

// ── Split an array into chunks of `size`. Always returns at least one chunk
//    (even if `arr` is empty) so a page always renders. ──
const chunkItems = (arr, size) => {
  const list = arr || []
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out.length ? out : [[]]
}

function InvoiceCopy({ invoice, items, startIndex, copyLabel, showTotals, pageInfo }) {
  const rows = [...items]
  while (rows.length < ROWS_PER_PAGE) rows.push(null)

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
  // hasDeposit: true only when there was an explicit partial deposit recorded
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

  // ── Balance display logic ──
  // paid + no deposit  → show "✓ បានបង់ពេញ" (customer paid in full, no partial)
  // paid + has deposit → show "✓ បានបង់ពេញ" (deposit covered everything)
  // partial            → show remaining amount in red
  // pending            → show full total (nothing paid yet)
  const balanceSingle = isPaid
    ? null          // null = show green "paid" marker
    : remainingAmt  // pending/partial = show what's owed

  return (
    <div style={{ padding: '4mm 5mm', position: 'relative', boxSizing: 'border-box', background: '#fff' }}>
      <div style={{ position: 'absolute', top: '3mm', right: '4mm', fontSize: '7px', color: B, fontWeight: '700', opacity: 0.5 }}>
        {copyLabel}
        {pageInfo && pageInfo.total > 1 && (
          <span style={{ marginLeft: '2mm', fontWeight: '600' }}>
            &nbsp;— ទំព័រ {pageInfo.page}/{pageInfo.total}
          </span>
        )}
      </div>

      {/* Header */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2mm' }}>
        <tbody><tr>
          <td style={{ width: '16mm', verticalAlign: 'middle' }}>
            <div style={{ width: '15mm', height: '15mm', border: `2px solid ${B}`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: LB }}>
              <div style={{ width: '11mm', height: '11mm', borderRadius: '50%', border: `1.5px dashed ${B}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: '900', color: B }}>{CO.badge}</span>
              </div>
            </div>
          </td>
          <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '0 2mm' }}>
            <div style={{ fontSize: '17px', fontWeight: '900', color: B, letterSpacing: '0.3px', lineHeight: 1.1 }}>{CO.name}</div>
            <div style={{ fontSize: '9px', fontWeight: '700', color: B, marginTop: '1mm', lineHeight: 1.25 }}>{CO.sub}</div>
            <div style={{ fontSize: '8px', color: B, marginTop: '0.8mm' }}>
              <span style={{ fontWeight: '700' }}>{CO.addrLbl}:&nbsp;</span>{CO.addr}
            </div>
          </td>
          <td style={{ width: '16mm' }} />
        </tr></tbody>
      </table>

      {/* Invoice number (left) + title (center) + phone numbers (right) */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2mm' }}>
        <tbody><tr>
          <td style={{ width: '28mm', verticalAlign: 'top', fontSize: '8px' }}>
            <div>
              <b>N°:&nbsp;</b>
              <span style={{ borderBottom: `1px solid ${B}`, fontWeight: '700', paddingBottom: '0.3mm' }}>{invoice.invoiceNumber}</span>
            </div>
          </td>
          <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
            <div style={{ fontSize: '14px', fontWeight: '900', color: B, letterSpacing: '0.3px', lineHeight: 1.1 }}>វិក្កយបត្រ</div>
            <div style={{ fontSize: '7px', fontWeight: '700', letterSpacing: '2px', color: B, marginTop: '1mm' }}>INVOICE</div>
          </td>
          <td style={{ width: '28mm', verticalAlign: 'top', textAlign: 'right', fontSize: '8px', lineHeight: 1.5 }}>
            <div><b>Tel:</b>&nbsp;{CO.tel1}</div>
            <div>📱&nbsp;{CO.tel2}</div>
            <div>📱&nbsp;{CO.tel3}</div>
          </td>
        </tr></tbody>
      </table>

      {/* Customer row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: `1.5px solid ${B}`, paddingBottom: '1.5mm', fontSize: '8px', flexWrap: 'wrap', gap: '1mm' }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: '900' }}>អតិថិជន:&nbsp;</span>
          <span style={{ display: 'inline-block', minWidth: '40mm', borderBottom: `1px dotted ${B}`, paddingBottom: '0.3mm' }}>{cust}</span>
          {phone && <span style={{ marginLeft: '2mm' }}>📞&nbsp;{phone}</span>}
        </div>
        <div style={{ whiteSpace: 'nowrap', fontSize: '8px' }}>
          ថ្ងៃ&thinsp;<span style={{ borderBottom: `1px solid ${B}`, minWidth: '5mm', display: 'inline-block', textAlign: 'center' }}>{day}</span>
          &thinsp;ខែ&thinsp;<span style={{ borderBottom: `1px solid ${B}`, minWidth: '5mm', display: 'inline-block', textAlign: 'center' }}>{month}</span>
          &thinsp;ឆ្នាំ&thinsp;<span style={{ borderBottom: `1px solid ${B}`, minWidth: '8mm', display: 'inline-block', textAlign: 'center' }}>{year}</span>
        </div>
      </div>

      {/* Items table */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: B }}>
            <th style={{ ...TH, width: '8mm' }}>{'លរ\nNo'}</th>
            <th style={{ ...TH }}>{'បរិយាយ\nDescription'}</th>
            <th style={{ ...TH, width: '14mm' }}>{'ចំនួន\nQty'}</th>
            <th style={{ ...TH, width: '20mm' }}>{'តម្លៃ\nUnit Price'}</th>
            <th style={{ ...TH, width: '24mm' }}>{'តម្លៃសរុប\nAmount'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item, i) => {
            const itemCurrency = isBoth ? (item?.currency || 'KHR') : invoice.currency
            return (
              <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : LB }}>
                <td style={{ ...TD, textAlign: 'center', fontWeight: '700' }}>{item ? startIndex + i + 1 : ''}</td>
                <td style={{ ...TD }}>
                  {item
                    ? <><span style={{ fontWeight: '600' }}>{item.brand ? ` ${item.brand}` : item.brand}</span>
                        {item.unitValue ? <span style={{ color: '#777' }}> ({item.unitValue}{item.unit})</span> : ''}
                        {isBoth && <span style={{ color: '#999', fontSize: '7px' }}> [{itemCurrency}]</span>}</>
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

      {/* Footer — only rendered on the last page of each copy so totals,
          signatures, and notes aren't repeated on every page. Earlier pages
          just end after the items table. */}
      {showTotals && (
        <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: `1.5px solid ${B}` }}>
          <tbody><tr>
            {/* Left: note + signatures */}
            <td style={{ border: `1px solid ${B}`, padding: '2mm', width: '55%', verticalAlign: 'top' }}>
              <div style={{ fontSize: '8px', lineHeight: 1.4, marginBottom: '3mm', fontWeight: '500' }}>
                <b style={{ fontSize: '9px' }}>*ចំណាំ:</b> ទំនិញដែលបានទិញរួចហើយ មិនអាចប្ដូរយកប្រាក់វិញបានទេ។
                {invoice.note && (
                  <div style={{ marginTop: '1mm', fontStyle: 'italic', color: '#333' }}>📝 {invoice.note}</div>
                )}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody><tr>
                  <td style={{ width: '50%', textAlign: 'center', paddingRight: '2mm' }}>
                    <div style={{ borderTop: `1px solid ${B}`, paddingTop: '1.5mm', marginTop: '8mm' }}>
                      <div style={{ fontWeight: '800', color: B, fontSize: '9px' }}>ហត្ថលេខាអ្នកទិញ</div>
                      <div style={{ color: '#777', fontSize: '7px', marginTop: '0.5mm' }}>Buyer Signature</div>
                    </div>
                  </td>
                  <td style={{ width: '50%', textAlign: 'center', paddingLeft: '2mm' }}>
                    <div style={{ borderTop: `1px solid ${B}`, paddingTop: '1.5mm', marginTop: '8mm' }}>
                      <div style={{ fontWeight: '800', color: B, fontSize: '9px' }}>ហត្ថលេខាអ្នកលក់</div>
                      <div style={{ color: '#777', fontSize: '7px', marginTop: '0.5mm' }}>Seller Signature</div>
                    </div>
                  </td>
                </tr></tbody>
              </table>
            </td>

            {/* Right: totals */}
            <td style={{ border: `1px solid ${B}`, padding: 0, verticalAlign: 'top' }}>
              {isBoth ? (
                // ── BOTH-CURRENCY: same row structure, 3 columns (label | ៛ | $) ──
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
                  <tbody>
                    {/* Subtotal + discount — only if discount exists */}
                    {(invoice.discountAmountKHR > 0 || invoice.discountAmountUSD > 0) && (<>
                      <tr style={{ borderBottom: `1px solid ${B}` }}>
                        <td style={{ padding: '1.5mm 2mm', fontWeight: '600', fontSize: '7px', color: '#555', borderRight: `1px solid ${B}` }}>សរុបរង</td>
                        <td style={{ padding: '1.5mm 2mm', textAlign: 'right', fontSize: '7px', color: '#555', borderRight: `1px dashed ${B}` }}>{invoice.subtotalKHR > 0 ? fmtKHR(invoice.subtotalKHR) : '—'}</td>
                        <td style={{ padding: '1.5mm 2mm', textAlign: 'right', fontSize: '7px', color: '#555' }}>{invoice.subtotalUSD > 0 ? fmtUSD(invoice.subtotalUSD) : '—'}</td>
                      </tr>
                      <tr style={{ borderBottom: `1px solid ${B}` }}>
                        <td style={{ padding: '1.5mm 2mm', color: 'red', fontSize: '7px', borderRight: `1px solid ${B}` }}>បញ្ចុះ</td>
                        <td style={{ padding: '1.5mm 2mm', textAlign: 'right', color: 'red', fontSize: '7px', borderRight: `1px dashed ${B}` }}>{invoice.discountAmountKHR > 0 ? `−${fmtKHR(invoice.discountAmountKHR)}` : '—'}</td>
                        <td style={{ padding: '1.5mm 2mm', textAlign: 'right', color: 'red', fontSize: '7px' }}>{invoice.discountAmountUSD > 0 ? `−${fmtUSD(invoice.discountAmountUSD)}` : '—'}</td>
                      </tr>
                    </>)}

                    {/* Currency header sub-row */}
                    <tr style={{ background: LB, borderBottom: `1px solid ${B}` }}>
                      <td style={{ padding: '1mm 2mm', borderRight: `1px solid ${B}` }}></td>
                      <td style={{ padding: '1mm 2mm', textAlign: 'center', fontWeight: '800', color: B, fontSize: '7px', borderRight: `1px dashed ${B}` }}>៛ រៀល</td>
                      <td style={{ padding: '1mm 2mm', textAlign: 'center', fontWeight: '800', color: B, fontSize: '7px' }}>$ ដុល្លារ</td>
                    </tr>

                    {/* Total row */}
                    <tr style={{ borderBottom: `1px solid ${B}`, background: LB }}>
                      <td style={{ padding: '2mm', fontWeight: '900', fontSize: '11px', color: B, borderRight: `1px solid ${B}` }}>សរុប/TOTAL</td>
                      <td style={{ padding: '2mm', textAlign: 'right', fontWeight: '900', fontSize: '10px', color: B, borderRight: `1px dashed ${B}` }}>{fmtKHR(totalKHR)}</td>
                      <td style={{ padding: '2mm', textAlign: 'right', fontWeight: '900', fontSize: '10px', color: B }}>{fmtUSD(totalUSD)}</td>
                    </tr>

                    {/* Deposit row */}
                    <tr style={{ borderBottom: `1px solid ${B}` }}>
                      <td style={{ padding: '2mm', fontWeight: '700', fontSize: '9px', borderRight: `1px solid ${B}` }}>កក់មុន/DEPOSIT</td>
                      <td style={{ padding: '2mm', textAlign: 'right', fontWeight: '700', borderRight: `1px dashed ${B}`, color: depositKHR > 0 ? '#1a7a3a' : '#999' }}>
                        {depositKHR > 0 ? `−${fmtKHR(depositKHR)}` : '—'}
                      </td>
                      <td style={{ padding: '2mm', textAlign: 'right', fontWeight: '700', color: depositUSD > 0 ? '#1a7a3a' : '#999' }}>
                        {depositUSD > 0 ? `−${fmtUSD(depositUSD)}` : '—'}
                      </td>
                    </tr>

                    {/* Balance row — hidden entirely when fully paid with no deposit */}
                    {(!isPaid || hasDepositBoth) && (
                      <tr>
                        <td style={{ padding: '2mm', fontWeight: '900', fontSize: '10px', color: B, borderRight: `1px solid ${B}` }}>នៅខ្វះ/BALANCE</td>
                        <td style={{ padding: '2mm', textAlign: 'right', fontWeight: '900', fontSize: '9px', borderRight: `1px dashed ${B}`,
                          color: remainingKHR === 0 ? '#1a7a3a' : 'red' }}>
                          {remainingKHR === 0 ? '✓ បានបង់ពេញ' : fmtKHR(remainingKHR)}
                        </td>
                        <td style={{ padding: '2mm', textAlign: 'right', fontWeight: '900', fontSize: '9px',
                          color: remainingUSD === 0 ? '#1a7a3a' : 'red' }}>
                          {remainingUSD === 0 ? '✓ បានបង់ពេញ' : fmtUSD(remainingUSD)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
                // ── SINGLE-CURRENCY totals ──
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
                  <tbody>
                    {invoice.discountAmount > 0 && (<>
                      <tr style={{ borderBottom: `1px solid ${B}` }}>
                        <td style={{ padding: '1.5mm 2mm', fontWeight: '600' }}>សរុបរង</td>
                        <td style={{ padding: '1.5mm 2mm', textAlign: 'right' }}>{fmtByCurrency(invoice.subtotal, invoice.currency)}</td>
                      </tr>
                      <tr style={{ borderBottom: `1px solid ${B}` }}>
                        <td style={{ padding: '1.5mm 2mm', color: 'red' }}>បញ្ចុះ</td>
                        <td style={{ padding: '1.5mm 2mm', textAlign: 'right', color: 'red' }}>-{fmtByCurrency(invoice.discountAmount, invoice.currency)}</td>
                      </tr>
                    </>)}

                    <tr style={{ borderBottom: `1px solid ${B}`, background: LB }}>
                      <td style={{ padding: '2mm', fontWeight: '900', fontSize: '11px', color: B }}>សរុប/TOTAL</td>
                      <td style={{ padding: '2mm', textAlign: 'right', fontWeight: '900', fontSize: '11px', color: B }}>{fmtByCurrency(totalAmt, invoice.currency)}</td>
                    </tr>

                    {/* Deposit row */}
                    <tr style={{ borderBottom: `1px solid ${B}` }}>
                      <td style={{ padding: '2mm', fontWeight: '700', fontSize: '9px' }}>កក់មុន/DEPOSIT</td>
                      <td style={{ padding: '2mm', textAlign: 'right', fontWeight: '700', color: '#1a7a3a' }}>
                        {hasDeposit && ("-"+fmtByCurrency(depositAmt, invoice.currency))}
                      </td>
                    </tr>

                    {/* Balance row — hidden entirely when fully paid with no deposit */}
                    <tr>
                      <td style={{ padding: '2mm', fontWeight: '900', fontSize: '10px', color: B }}>នៅខ្វះ/BALANCE</td>
                      <td style={{ padding: '2mm', textAlign: 'right', fontWeight: '900', fontSize: '10px',
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
      )}
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

  // ── PRINT FIX FOR MOBILE ──
  // Previously this used react-to-print with a custom async `print:` callback that
  // built a hidden iframe and called `iframe.contentWindow.print()` after some async
  // work (waiting for the iframe to load, etc). Desktop browsers tolerate that, but
  // iOS Safari and most mobile Chrome builds only allow window.print() to open the
  // system print/PDF sheet when it's called *synchronously*, inside the same tap
  // event that triggered it. Once you `await` anything first, the "user gesture" is
  // gone and print() silently no-ops — which is exactly the "blank" behavior you saw
  // on phones (desktop still worked because it's more lenient about this).
  //
  // Fix: don't use an iframe at all. The global PRINT_STYLE below already hides
  // everything except #inv-print during printing, so we can just call the browser's
  // own window.print() directly and synchronously on tap. No iframe, no async gap.
  const handlePrint = () => {
    window.print()
  }

  // Side effects that used to run in react-to-print's onAfterPrint.
  // `afterprint` fires reliably on desktop and Android Chrome, but is unreliable on
  // iOS Safari (it can fail to fire at all after a native print sheet is dismissed).
  // We still listen for it as the primary path, but don't depend on it being the
  // only way these run — see handlePrintAndNotify below for the mobile-safe version.
  useEffect(() => {
    const onAfterPrint = async () => {
      await invoiceAPI.markPrinted(id)
      if (invoice) {
        const ok = await sendOrderToTelegram(invoice, 'បោះពុម្ព')
        if (ok) toast.success('📨 បានផ្ញើទៅ Telegram')
      }
    }
    window.addEventListener('afterprint', onAfterPrint)
    return () => window.removeEventListener('afterprint', onAfterPrint)
  }, [invoice, id])

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

  // ── Split items into pages, once per render. Both the customer copy
  //    and the shop copy walk the same chunks so page counts always match. ──
  const itemChunks = chunkItems(invoice?.items, ROWS_PER_PAGE)
  const lastPageIdx = itemChunks.length - 1

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
        {itemChunks.length > 1 && (
          <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-semibold">
            📄 {itemChunks.length} ទំព័រ/ច្បាប់
          </span>
        )}

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
        <button onClick={handlePrint} className="btn-primary text-sm">🖨️ បោះពុម្ព / PDF</button>
      </div>

      {/* Reminder: the URL/date/page-number line at the bottom of a printed page
          comes from the browser itself, not this app — turn it off in the print
          dialog under "More settings" → uncheck "Headers and footers". */}
      <p className="no-print text-xs text-gray-400">
        ℹ️ បើមានអក្សរ URL/កាលបរិច្ឆេទនៅផ្នែកខាងក្រោមក្រដាស នោះជា header/footer លំនាំដើមរបស់ browser —
        សូមទៅកាន់ dialog បោះពុម្ព → "More settings" → ដកធីក "Headers and footers"។
      </p>

      {/* Printable invoice */}
      <div style={{ overflowX: 'auto' }}>
        <div id="inv-print" ref={printRef} style={{
          fontFamily: "'Khmer OS Battambang','Hanuman','Noto Sans Khmer',sans-serif",
          color: B, background: '#fff', width: '148mm', margin: '0 auto',
          boxSizing: 'border-box', fontSize: '9px', lineHeight: 1.4,
          boxShadow: '0 4px 32px rgba(0,0,0,0.12)', overflow: 'visible',
        }}>
          {/* Customer copy — always shown on screen, page-broken after every
              chunk (including the last one, so the shop copy starts clean). */}
          {itemChunks.map((chunk, i) => (
            <div key={`cust-${i}`} style={{ pageBreakAfter: 'always', breakAfter: 'page' }}>
              <InvoiceCopy
                invoice={invoice}
                items={chunk}
                startIndex={i * ROWS_PER_PAGE}
                copyLabel="អតិថិជន / Customer Copy"
                showTotals={i === lastPageIdx}
                pageInfo={{ page: i + 1, total: itemChunks.length }}
              />
            </div>
          ))}

          {/* Shop copy — only rendered into the DOM for printing (.print-only),
              same chunking so item numbering and totals placement match. */}
          <div className="print-only">
            {itemChunks.map((chunk, i) => (
              <div
                key={`shop-${i}`}
                style={i < lastPageIdx ? { pageBreakAfter: 'always', breakAfter: 'page' } : {}}
              >
                <InvoiceCopy
                  invoice={invoice}
                  items={chunk}
                  startIndex={i * ROWS_PER_PAGE}
                  copyLabel="ហាង / Shop Copy"
                  showTotals={i === lastPageIdx}
                  pageInfo={{ page: i + 1, total: itemChunks.length }}
                />
              </div>
            ))}
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