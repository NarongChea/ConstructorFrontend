import axios from 'axios'
import toast from 'react-hot-toast'

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || ''}/api`,
  timeout: 15000,
})

// ─────────────────────────────────────────────────────────────────────────────
// GET cache
//  • memory cache with TTL per endpoint
//  • de-duplicates identical requests that are in flight at the same time
//  • "static" data (categories, locations, ...) is also saved in localStorage,
//    so it is instant even after a page refresh
//  • any successful POST/PUT/PATCH/DELETE clears the related cache
// ─────────────────────────────────────────────────────────────────────────────
const PREFIX = 'apicache:'
const MIN = 60 * 1000

// First match wins. ttl 0 = never cache. Anything not listed = not cached.
const RULES = [
  { re: /^\/variants\/low-stock/,            ttl: 0 },
  { re: /^\/stock\/low-stock/,               ttl: 0 },
  { re: /^\/partners\/[^/]+\/(balance|transactions)/, ttl: 0 },
  { re: /^\/(categories|locations|unit-types|settings)/, ttl: 10 * MIN },
  { re: /^\/(products|variants|partners|suppliers|user-prices)/, ttl: 2 * MIN },
  { re: /^\/(reports|dashboard)/,            ttl: 1 * MIN },
  { re: /^\/auth\/me/,                       ttl: 5 * MIN },
]
const STATIC_ROOTS = new Set(['categories', 'locations', 'unit-types', 'settings'])

const mem = new Map()      // key -> { data, status, exp, root }
const inflight = new Map() // key -> Promise

const rootOf = (url) => (url || '').split('?')[0].split('/').filter(Boolean)[0]
const ttlOf = (url) => RULES.find(r => r.re.test(url))?.ttl || 0
const makeKey = (url, params) => url + '|' + JSON.stringify(params || {})

function readStore(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
function writeStore(key, entry) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(entry)) } catch {}
}

export function clearApiCache(onlyStatic = false) {
  mem.clear()
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(PREFIX))
      .forEach(k => localStorage.removeItem(k))
  } catch {}
}

function invalidate(url) {
  const root = rootOf(url)
  // login/logout or changing static data (affects names inside products etc.) → clear all
  if (root === 'auth' || STATIC_ROOTS.has(root)) return clearApiCache()
  // other changes: clear everything except the static data
  for (const [k, v] of mem) {
    if (!STATIC_ROOTS.has(v.root)) mem.delete(k)
  }
}

const rawGet = api.get.bind(api)

api.get = (url, config = {}) => {
  const { noCache, forceRefresh, ...axiosCfg } = config
  const ttl = noCache ? 0 : ttlOf(url)
  if (!ttl) return rawGet(url, axiosCfg)

  const key = makeKey(url, axiosCfg.params)
  const root = rootOf(url)

  const respond = (e) => ({
    data: structuredClone(e.data), // clone so components can't corrupt the cache
    status: e.status,
    fromCache: true,
  })

  if (!forceRefresh) {
    let hit = mem.get(key)
    if (!hit && STATIC_ROOTS.has(root)) {
      hit = readStore(key)
      if (hit) mem.set(key, hit)
    }
    if (hit && hit.exp > Date.now()) return Promise.resolve(respond(hit))
    if (inflight.has(key)) return inflight.get(key).then(respond)
  }

  const p = rawGet(url, axiosCfg)
    .then(res => {
      const entry = { data: res.data, status: res.status, exp: Date.now() + ttl, root }
      mem.set(key, entry)
      if (STATIC_ROOTS.has(root)) writeStore(key, entry)
      return entry
    })
    .finally(() => inflight.delete(key))

  inflight.set(key, p)
  return p.then(respond)
}

;['post', 'put', 'patch', 'delete'].forEach(method => {
  const raw = api[method].bind(api)
  api[method] = (url, ...args) =>
    raw(url, ...args).then(res => {
      invalidate(url)
      return res
    })
})

// ─────────────────────────────────────────────────────────────────────────────
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  res => {
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
      clearApiCache()
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