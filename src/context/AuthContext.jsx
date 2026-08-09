import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../api/Axios.js'
import toast from 'react-hot-toast'

const AuthContext = createContext(null)

function safeParseUser(stored) {
  if (!stored || stored === 'undefined' || stored === 'null') return null
  try {
    return JSON.parse(stored)
  } catch {
    // Corrupted value from a previous broken session — wipe it
    localStorage.removeItem('user')
    localStorage.removeItem('token')
    return null
  }
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('user')
    const token  = localStorage.getItem('token')
    const parsed = safeParseUser(stored)
    if (parsed && token && token !== 'undefined') {
      setUser(parsed)
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    } else {
      // Clean up any leftover garbage
      localStorage.removeItem('user')
      localStorage.removeItem('token')
    }
    setLoading(false)
  }, [])

  const login = useCallback(async (email, password) => {
    // After the Axios response interceptor unwraps the envelope,
    // res.data = { _id, name, email, role, isActive, ..., token }
    const res = await api.post('/auth/login', { email, password })
    const { token, ...u } = res.data

    localStorage.setItem('token', token)
    localStorage.setItem('user',  JSON.stringify(u))
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    setUser(u)
    return u
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    delete api.defaults.headers.common['Authorization']
    setUser(null)
    toast.success('បានចាកចេញដោយជោគជ័យ')
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}