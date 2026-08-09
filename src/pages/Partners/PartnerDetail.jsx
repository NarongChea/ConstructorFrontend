import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { partnerAPI, userPriceAPI } from '../../api/index.js'
import { formatCurrency, formatDateTime, INVOICE_TYPE } from '../../utils/formatters.js'
import { PageLoader, StatCard } from '../../components/UI/index.jsx'
import Pagination from '../../components/UI/Pagination.jsx'

export default function PartnerDetail() {
  const { id } = useParams()
  const [partner,      setPartner]      = useState(null)
  const [balance,      setBalance]      = useState(null)
  const [transactions, setTransactions] = useState([])
  const [txPag,        setTxPag]        = useState(null)
  const [prices,       setPrices]       = useState([])
  const [txPage,       setTxPage]       = useState(1)
  const [loading,      setLoading]      = useState(true)

  useEffect(() => {
    Promise.all([
      partnerAPI.get(id),
      partnerAPI.getBalance(id),
      partnerAPI.getTransactions(id, { page: txPage, limit: 15 }),
      userPriceAPI.forPartner(id),
    ]).then(([p, b, t, pr]) => {
      setPartner(p.data)
      setBalance(b.data)
      setTransactions(t.data?.transactions ?? [])
      setTxPag(t.data?.pagination ?? null)
      setPrices(Array.isArray(pr.data) ? pr.data : [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [id, txPage])

  if (loading) return <PageLoader />
  if (!partner) return <div className="card p-8 text-center text-gray-400">រកមិនឃើញដៃគូ</div>

  const bal = balance || {}
  const balStatus = bal.status === 'partner_owes_us'
    ? { label: 'ដៃគូជំពាក់យើង', cls: 'badge-green', color: 'green' }
    : bal.status === 'we_owe_partner'
    ? { label: 'យើងជំពាក់ដៃគូ',  cls: 'badge-red',   color: 'red'   }
    : { label: 'ស្មើគ្នា',          cls: 'badge-gray',  color: 'blue'  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/partners" className="btn-secondary text-sm">← ត្រឡប់</Link>
        <h2 className="text-lg font-semibold text-gray-800 ml-2">{partner.name}</h2>
        <span className={partner.isActive ? 'badge-green' : 'badge-red'}>{partner.isActive ? 'សកម្ម' : 'អសកម្ម'}</span>
      </div>

      {/* Balance cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="លក់ឱ្យដៃគូ"    value={formatCurrency(bal.totalSales)}     icon="💵" color="blue"   sub={`${bal.salesCount || 0} វិក្កយបត្រ`} />
        <StatCard label="ទិញពីដៃគូ"     value={formatCurrency(bal.totalPurchases)} icon="🛒" color="red"    sub={`${bal.purchasesCount || 0} ការទិញ`} />
        <StatCard label="ចំនួនត្រូវបង់" value={formatCurrency(bal.amountDue)}     icon="⚖️" color={balStatus.color} sub={balStatus.label} />
        <div className="stat-card justify-center items-center">
          <span className={`${balStatus.cls} text-sm px-3 py-1.5`}>{balStatus.label}</span>
          <p className="text-xs text-gray-400 mt-1 text-center">{bal.amountDue > 0 ? formatCurrency(bal.amountDue) : 'គ្មានជំពាក់'}</p>
        </div>
      </div>

      {/* Partner info + Prices */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">ព័ត៌មានដៃគូ</h3>
          <div className="space-y-2 text-sm">
            {partner.phone   && <p>📞 {partner.phone}</p>}
            {partner.email   && <p>📧 {partner.email}</p>}
            {partner.address && <p>📍 {partner.address}</p>}
            {partner.contact && <p>👤 {partner.contact}</p>}
            {partner.note    && <p className="text-gray-400 italic">"{partner.note}"</p>}
          </div>
          <div className="flex gap-2 mt-3">
            {partner.canBuyFromUs && <span className="badge-blue">អ្នកទិញ</span>}
            {partner.canSellToUs  && <span className="badge-purple">អ្នកលក់</span>}
          </div>
          <div className="flex gap-2 mt-3">
            <Link to={`/invoices?partnerId=${id}`} className="btn-secondary text-xs flex-1 justify-center">🧾 វិក្កយបត្រ</Link>
            <Link to={`/purchases?partnerId=${id}`} className="btn-secondary text-xs flex-1 justify-center">🛒 ការទិញ</Link>
          </div>
        </div>

        {/* Custom prices */}
        <div className="card p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">💲 តម្លៃពិសេសសម្រាប់ដៃគូ</h3>
          {prices.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">គ្មានតម្លៃពិសេស — ប្រើតម្លៃស្តង់ដារ</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header text-left">SKU</th>
                    <th className="table-header text-left">ឯកតា</th>
                    <th className="table-header text-right">តម្លៃពិសេស</th>
                    <th className="table-header text-right">តម្លៃស្តង់ដារ</th>
                  </tr>
                </thead>
                <tbody>
                  {prices.map(pr => (
                    <tr key={pr._id} className="hover:bg-gray-50">
                      <td className="table-cell font-mono text-xs">{pr.variantId?.sku}</td>
                      <td className="table-cell">{pr.variantId?.unitValue} {pr.variantId?.unit}</td>
                      <td className="table-cell text-right font-semibold text-primary-600">{formatCurrency(pr.price)}</td>
                      <td className="table-cell text-right text-gray-400">{formatCurrency(pr.variantId?.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3">
            <Link to={`/user-prices?partnerId=${id}`} className="btn-secondary text-xs">+ កំណត់តម្លៃពិសេស</Link>
          </div>
        </div>
      </div>

      {/* Transaction history */}
      <div className="card">
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">ប្រវត្តិប្រតិបត្តិការ</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header text-left">ប្រភេទ</th>
                <th className="table-header text-left">ឯកសារ</th>
                <th className="table-header text-right">ចំនួន</th>
                <th className="table-header text-center">ទិញ/លក់</th>
                <th className="table-header text-left">កាលបរិច្ឆេទ</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-sm text-gray-400">គ្មានប្រតិបត្តិការ</td></tr>
              )}
              {transactions.map(tx => (
                <tr key={tx._id} className="hover:bg-gray-50">
                  <td className="table-cell">
                    <span className={tx.type === 'sale' ? 'badge-blue' : 'badge-purple'}>
                      {tx.type === 'sale' ? '🧾 លក់ចេញ' : '🛒 ទិញចូល'}
                    </span>
                  </td>
                  <td className="table-cell font-mono text-xs text-gray-500">{tx.reference || '—'}</td>
                  <td className={`table-cell text-right font-semibold ${tx.direction === 'incoming' ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.direction === 'incoming' ? '+' : '−'} {formatCurrency(tx.amount)}
                  </td>
                  <td className="table-cell text-center">
                    <span className={tx.direction === 'incoming' ? 'badge-green' : 'badge-red'}>
                      {tx.direction === 'incoming' ? 'ចូល' : 'ចេញ'}
                    </span>
                  </td>
                  <td className="table-cell text-xs text-gray-500">{formatDateTime(tx.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination pagination={txPag} onChange={setTxPage} />
      </div>
    </div>
  )
}