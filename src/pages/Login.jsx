import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import toast from 'react-hot-toast'

export default function Login() {
  const { login } = useAuth()
  const navigate  = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!form.email || !form.password) { toast.error('សូមបំពេញព័ត៌មានទាំងអស់'); return }
    setLoading(true)
    try {
      await login(form.email, form.password)
      toast.success('ចូលប្រព័ន្ធដោយជោគជ័យ!')
      navigate('/dashboard')
    } catch {
      // error handled in interceptor
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-800 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center text-4xl mx-auto mb-4 backdrop-blur">
            🏗️
          </div>
          <h1 className="text-2xl font-bold text-white">ក្រុមហ៊ុនសំណង់</h1>
          <p className="text-primary-300 text-sm mt-1">ប្រព័ន្ធគ្រប់គ្រងអាជីវកម្ម</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-5">ចូលប្រព័ន្ធ</h2>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">អ៊ីមែល</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className="input-field"
                placeholder="admin@example.com"
                autoComplete="email"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ពាក្យសម្ងាត់</label>
              <input
                type="password"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                className="input-field"
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary justify-center py-2.5 text-base"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  កំពុងចូល...
                </span>
              ) : 'ចូលប្រព័ន្ធ'}
            </button>
          </form>
        </div>

        <p className="text-center text-primary-400 text-xs mt-6">
          © {new Date().getFullYear()} ក្រុមហ៊ុនសំណង់ · ប្រព័ន្ធគ្រប់គ្រង
        </p>
      </div>
    </div>
  )
}