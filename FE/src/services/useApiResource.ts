import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from './api'

/** Ignores superseded requests and never displays another route/account's result. */
export function useApiResource<T>(path: string | null, identity = '', refreshOnFocus = false) {
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ key: string; revision: number; data: T | null; error: string } | null>(null)
  const key = identity + ':' + path
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    if (!refreshOnFocus) return
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [refreshOnFocus, refresh])
  useEffect(() => {
    if (!path) return
    const controller = new AbortController()
    apiRequest<T>(path, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setResult({ key, revision, data, error: '' }) })
      .catch(caught => {
        if (!controller.signal.aborted) setResult({ key, revision, data: null, error: caught instanceof Error ? caught.message : 'Không thể tải dữ liệu.' })
      })
    return () => controller.abort()
  }, [path, key, revision])
  const current = path && result?.key === key && result.revision === revision ? result : null
  return { data: current?.data ?? null, error: current?.error ?? '', loading: Boolean(path && !current), refresh }
}
