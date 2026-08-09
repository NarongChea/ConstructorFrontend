import { useState, useCallback } from 'react'

export function useApi() {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const run = useCallback(async (apiFn, ...args) => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFn(...args)
      return res.data
    } catch (err) {
      setError(err.response?.data?.message || 'មានបញ្ហាកើតឡើង')
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  return { loading, error, run }
}