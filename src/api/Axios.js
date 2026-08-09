import axios from 'axios'
import toast from 'react-hot-toast'

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || ''}/api`,
  timeout: 15000,
})

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  res => {
    // Unwrap the standard { success, message, data } envelope so every
    // caller can do `res.data.X` instead of `res.data.data.X`.
    // For login the backend also puts `token` at the root level —
    // merge it into the unwrapped object so AuthContext can read it.
    const body = res.data
    if (body && typeof body === 'object' && 'data' in body) {
      const inner = body.data
      if (body.token && inner && typeof inner === 'object') {
        res.data = { ...inner, token: body.token }
      } else {
        res.data = inner
      }
    }
    return res
  },
  err => {
    const msg = err.response?.data?.message || 'មានបញ្ហាកើតឡើង'
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    } else if (err.response?.status !== 404) {
      toast.error(msg)
    }
    return Promise.reject(err)
  }
)

export default api