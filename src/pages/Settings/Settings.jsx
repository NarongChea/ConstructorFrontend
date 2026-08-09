import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext.jsx'
import { settingAPI } from '../../api/index.js'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'

export default function Settings() {
  const { user, logout } = useAuth()

  // ── Exchange rate state — TWO independent rates, not reciprocal ──
  // usdToKhr: used when converting a USD-priced item INTO a KHR total
  // khrToUsd: used when converting a KHR-priced item INTO a USD total
  const [usdToKhr,     setUsdToKhr]     = useState('')
  const [khrToUsd,     setKhrToUsd]     = useState('')
  const [savedUsdToKhr, setSavedUsdToKhr] = useState(null)
  const [savedKhrToUsd, setSavedKhrToUsd] = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [rateConfirm,  setRateConfirm]  = useState(false) // double confirm before saving

  useEffect(() => {
    settingAPI.getExchangeRate()
      .then(r => {
        const u = r.data?.usdToKhr ?? 4100
        const k = r.data?.khrToUsd ?? 4100
        setUsdToKhr(String(u)); setSavedUsdToKhr(u)
        setKhrToUsd(String(k)); setSavedKhrToUsd(k)
      })
      .catch(() => toast.error('មិនអាចទាញអត្រាប្ដូររូបិយប័ណ្ណបាន'))
      .finally(() => setLoading(false))
  }, [])

  const hasChanged =
    (savedUsdToKhr !== null && Number(usdToKhr) !== savedUsdToKhr) ||
    (savedKhrToUsd !== null && Number(khrToUsd) !== savedKhrToUsd)

  // Step 1: validate, then open confirm dialog (dangerous — affects all future invoice totals)
  const requestSaveRate = () => {
    const u = Number(usdToKhr)
    const k = Number(khrToUsd)
    if (!u || u <= 0) { toast.error('សូមបញ្ចូលអត្រា USD → ៛ ត្រឹមត្រូវ'); return }
    if (!k || k <= 0) { toast.error('សូមបញ្ចូលអត្រា ៛ → USD ត្រឹមត្រូវ'); return }
    setRateConfirm(true)
  }

  // Step 2: actually save after confirmation
  const confirmSaveRate = async () => {
    setSaving(true)
    try {
      const res = await settingAPI.updateExchangeRate({
        usdToKhr: Number(usdToKhr),
        khrToUsd: Number(khrToUsd),
      })
      setSavedUsdToKhr(res.data?.usdToKhr ?? Number(usdToKhr))
      setSavedKhrToUsd(res.data?.khrToUsd ?? Number(khrToUsd))
      toast.success('✅ អត្រាប្ដូររូបិយប័ណ្ណបានកែប្រែដោយជោគជ័យ')
      setRateConfirm(false)
    } catch (err) {
      toast.error(err?.response?.data?.message || 'មានបញ្ហា')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">គណនីរបស់ខ្ញុំ</h2>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 bg-primary-600 rounded-full flex items-center justify-center text-2xl font-bold text-white">
            {user?.name?.[0]?.toUpperCase() || 'A'}
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-800">{user?.name || 'Admin'}</p>
            <p className="text-sm text-gray-400">{user?.email || ''}</p>
            <span className="badge-blue mt-1 inline-block capitalize">{user?.role || 'admin'}</span>
          </div>
        </div>
        <div className="border-t pt-4">
          <button onClick={logout} className="btn-danger">🚪 ចាកចេញ</button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          Exchange Rates — TWO independent values
          usdToKhr: used in InvoiceCreate's KHR mode to convert USD items
          khrToUsd: used in InvoiceCreate's USD mode to convert KHR items
          They are NOT mathematically reciprocal — set independently.
      ══════════════════════════════════════════════ */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-1">💱 អត្រាប្ដូររូបិយប័ណ្ណ</h2>
        <p className="text-xs text-gray-400 mb-4">
          អត្រាទាំងពីរនេះត្រូវបានកំណត់ដាច់ដោយឡែកពីគ្នា (មិនចាំបាច់ស្មើគ្នាទេ)។
          ត្រូវបានប្រើនៅពេលបង្កើតវិក្កយបត្រ ដើម្បីបម្លែងតម្លៃទំនិញពីរូបិយប័ណ្ណមួយទៅរូបិយប័ណ្ណមួយទៀត។
          ការផ្លាស់ប្ដូរនឹងប៉ះពាល់តែវិក្កយបត្រថ្មីៗប៉ុណ្ណោះ (មិនប៉ះពាល់វិក្កយបត្រចាស់ទេ)។
        </p>

        {loading ? (
          <p className="text-sm text-gray-400 py-4">កំពុងផ្ទុក...</p>
        ) : (
          <div className="space-y-4">

            {/* USD → KHR rate */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-blue-700">USD ➜ រៀល (KHR)</label>
                {savedUsdToKhr !== null && (
                  <span className="text-xs text-gray-400">
                    បច្ចុប្បន្ន: <strong className="text-gray-600">{savedUsdToKhr.toLocaleString()} ៛</strong>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600 whitespace-nowrap">1 USD =</span>
                <input
                  type="number" min="1" step="10"
                  className="input-field flex-1 font-semibold text-right text-lg"
                  value={usdToKhr}
                  onChange={e => setUsdToKhr(e.target.value)}
                  placeholder="4100"
                />
                <span className="text-sm text-gray-600 whitespace-nowrap">រៀល</span>
              </div>
              <p className="text-xs text-blue-400">ប្រើនៅពេលជ្រើស «KHR» — បម្លែងទំនិញតម្លៃ $ ទៅជា ៛</p>
            </div>

            {/* KHR → USD rate */}
            <div className="bg-green-50 border border-green-100 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-green-700">រៀល (KHR) ➜ USD</label>
                {savedKhrToUsd !== null && (
                  <span className="text-xs text-gray-400">
                    បច្ចុប្បន្ន: <strong className="text-gray-600">{savedKhrToUsd.toLocaleString()} ៛ / $1</strong>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600 whitespace-nowrap">1 USD =</span>
                <input
                  type="number" min="1" step="10"
                  className="input-field flex-1 font-semibold text-right text-lg"
                  value={khrToUsd}
                  onChange={e => setKhrToUsd(e.target.value)}
                  placeholder="4100"
                />
                <span className="text-sm text-gray-600 whitespace-nowrap">រៀល</span>
              </div>
              <p className="text-xs text-green-500">ប្រើនៅពេលជ្រើស «USD» — បម្លែងទំនិញតម្លៃ ៛ ទៅជា $</p>
            </div>

            {hasChanged && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700 font-medium space-y-1">
                <p>⚠️ ការផ្លាស់ប្ដូរអត្រា:</p>
                {Number(usdToKhr) !== savedUsdToKhr && (
                  <p>• USD→៛: {savedUsdToKhr?.toLocaleString()} → <strong>{Number(usdToKhr).toLocaleString()}</strong></p>
                )}
                {Number(khrToUsd) !== savedKhrToUsd && (
                  <p>• ៛→USD: {savedKhrToUsd?.toLocaleString()} → <strong>{Number(khrToUsd).toLocaleString()}</strong></p>
                )}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t">
              <button
                onClick={requestSaveRate}
                disabled={saving || !hasChanged}
                className="btn-primary"
              >
                {saving ? 'កំពុងរក្សា...' : '💾 រក្សាទុកអត្រាប្ដូរ'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-2">អំពីប្រព័ន្ធ</h2>
        <div className="text-sm text-gray-500 space-y-1">
          <p>ប្រព័ន្ធគ្រប់គ្រងអាជីវកម្ម — ក្រុមហ៊ុនសំណង់</p>
          <p>Version 1.0.0</p>
        </div>
      </div>

      {/* ── Double confirm before changing exchange rates — dangerous, affects all future invoice totals ── */}
      <ConfirmDialog
        open={rateConfirm}
        onClose={() => setRateConfirm(false)}
        onConfirm={confirmSaveRate}
        loading={saving}
        title="⚠️ បញ្ជាក់ការផ្លាស់ប្ដូរអត្រាប្ដូររូបិយប័ណ្ណ"
        message={`តើអ្នកប្រាកដចង់ប្ដូរអត្រាប្ដូររូបិយប័ណ្ណ?\n\nUSD→៛: ${savedUsdToKhr?.toLocaleString()} ➜ ${Number(usdToKhr).toLocaleString()}\n៛→USD: ${savedKhrToUsd?.toLocaleString()} ➜ ${Number(khrToUsd).toLocaleString()}\n\nការផ្លាស់ប្ដូរនេះនឹងអនុវត្តចំពោះវិក្កយបត្រថ្មីៗទាំងអស់ភ្លាមៗ។`}
      />
    </div>
  )
}