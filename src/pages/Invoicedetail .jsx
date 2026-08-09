import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useReactToPrint } from 'react-to-print'
import toast from 'react-hot-toast'
import { invoiceAPI } from '../../api/index.js'
import { formatCurrency, formatDateTime, INVOICE_STATUS } from '../../utils/formatters.js'
import { PageLoader } from '../../components/UI/index.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'

export default function InvoiceDetail() {
  const { id } = useParams()
  const [invoice, setInvoice] = useState(null)
  const [loading, setLoading] = useState(true)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const printRef = useRef()

  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    onAfterPrint: () => invoiceAPI.markPrinted(id),
  })

  useEffect(() => {
    invoiceAPI.get(id).then(r => setInvoice(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  const cancelInvoice = async () => {
    await invoiceAPI.updateStatus(id, 'cancelled')
    toast.success('វិក្កយបត្របានបោះបង់')
    setCancelConfirm(false)
    setInvoice(p => ({ ...p, status: 'cancelled' }))
  }

  if (loading) return <PageLoader />
  if (!invoice) return <div className="card p-8 text-center text-gray-400">រកមិនឃើញវិក្កយបត្រ</div>

  const st = INVOICE_STATUS[invoice.status] || INVOICE_STATUS.pending

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex items-center gap-2 no-print">
        <Link to="/invoices" className="btn-secondary text-sm">← ត្រឡប់</Link>
        <div className="flex-1" />
        <span className={`${st.cls} text-sm px-3 py-1.5`}>{st.label}</span>
        {invoice.status !== 'cancelled' && (
          <button onClick={() => setCancelConfirm(true)} className="btn-danger text-sm">🚫 បោះបង់</button>
        )}
        <button onClick={handlePrint} className="btn-primary text-sm">🖨️ បោះពុម្ព</button>
      </div>

      {/* Printable Invoice */}
      <div ref={printRef} className="card p-6 print:shadow-none print:border-0">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 pb-4 border-b border-gray-200">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center text-white text-xl">🏗</div>
              <div>
                <h1 className="text-lg font-bold text-gray-800">ក្រុមហ៊ុនសំណង់</h1>
                <p className="text-xs text-gray-400">ប្រព័ន្ធគ្រប់គ្រងអាជីវកម្ម</p>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-primary-600">វិក្កយបត្រ</p>
            <p className="text-sm font-mono font-semibold text-gray-700 mt-1">{invoice.invoiceNumber}</p>
            <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(invoice.createdAt)}</p>
          </div>
        </div>

        {/* Customer / Partner Info */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              {invoice.invoiceType === 'partner' ? 'ដៃគូ' : 'អតិថិជន'}
            </p>
            <p className="font-semibold text-gray-800">{invoice.partnerName || invoice.customerName}</p>
            {invoice.customerPhone && <p className="text-sm text-gray-500 mt-0.5">📞 {invoice.customerPhone}</p>}
            {invoice.customerType && (
              <span className="mt-1 badge-blue inline-block capitalize">{invoice.customerType}</span>
            )}
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">ព័ត៌មានបន្ថែម</p>
            <p className="text-sm text-gray-600">បង្កើតដោយ: <span className="font-medium">{invoice.createdBy?.name || '—'}</span></p>
            {invoice.printedAt && <p className="text-sm text-gray-500 mt-0.5">បោះពុម្ព: {formatDateTime(invoice.printedAt)}</p>}
            {invoice.note && <p className="text-sm text-gray-500 mt-1 italic">"{invoice.note}"</p>}
          </div>
        </div>

        {/* Items table */}
        <table className="w-full mb-4">
          <thead>
            <tr className="bg-gray-50">
              <th className="table-header text-left w-8">#</th>
              <th className="table-header text-left">ផលិតផល</th>
              <th className="table-header text-left">SKU</th>
              <th className="table-header text-left">ឯកតា</th>
              <th className="table-header text-right">ចំនួន</th>
              <th className="table-header text-right">តម្លៃ/ឯកតា</th>
              <th className="table-header text-right">សរុប</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.items || []).map((item, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="table-cell text-gray-400 text-xs">{i + 1}</td>
                <td className="table-cell">
                  <p className="font-medium text-gray-800">{item.productName}</p>
                  {item.brand && <p className="text-xs text-gray-400">{item.brand}</p>}
                  {item.unitTypeName && <p className="text-xs text-primary-500">{item.unitTypeName}</p>}
                </td>
                <td className="table-cell font-mono text-xs text-gray-400">{item.sku}</td>
                <td className="table-cell text-sm text-gray-600">{item.unitValue} {item.unit}</td>
                <td className="table-cell text-right font-medium">{item.quantity}</td>
                <td className="table-cell text-right text-gray-600">{formatCurrency(item.unitPrice)}</td>
                <td className="table-cell text-right font-semibold text-gray-800">{formatCurrency(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-72 space-y-1.5">
            <div className="flex justify-between text-sm text-gray-600">
              <span>សរុបរង:</span>
              <span>{formatCurrency(invoice.subtotal)}</span>
            </div>
            {invoice.discountAmount > 0 && (
              <div className="flex justify-between text-sm text-red-500">
                <span>បញ្ចុះ ({invoice.discountType === 'percent' ? `${invoice.discountValue}%` : 'ថេរ'}):</span>
                <span>- {formatCurrency(invoice.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold text-gray-800 pt-2 border-t border-gray-200">
              <span>សរុបទូទៅ:</span>
              <span className="text-primary-600">{formatCurrency(invoice.total)}</span>
            </div>
          </div>
        </div>

        {/* Footer for print */}
        <div className="mt-8 pt-4 border-t border-gray-100 print-only text-center">
          <p className="text-xs text-gray-400">អរគុណសម្រាប់ការទំនាក់ទំនង! · ក្រុមហ៊ុនសំណង់</p>
        </div>
      </div>

      <ConfirmDialog
        open={cancelConfirm} onClose={() => setCancelConfirm(false)} onConfirm={cancelInvoice}
        title="បោះបង់វិក្កយបត្រ" message="តើអ្នកប្រាកដចង់បោះបង់វិក្កយបត្រនេះ? ស្ទុំនឹងត្រូវដាក់ស្ដារវិញ។"
      />
    </div>
  )
}