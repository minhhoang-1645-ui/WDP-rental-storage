import { useCallback, useEffect, useState } from 'react'
import { ApiError, apiRequest } from './api'
import { hasDraft, useLiveRefresh } from './live-events'

/** Ignores superseded requests and never displays another route/account's result. */
export function useApiResource<T>(path: string | null, identity = '', refreshOnFocus = false, protectDraft = false) {
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ key: string; revision: number; data: T | null; error: string; status: number | null } | null>(null)
  const key = identity + ':' + path
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  useLiveRefresh(path, refresh)
  useEffect(() => {
    if (!refreshOnFocus) return
    const focus = () => { if (!hasDraft()) refresh() }
    window.addEventListener('focus', focus)
    return () => window.removeEventListener('focus', focus)
  }, [refreshOnFocus, refresh])
  useEffect(() => {
    if (!path) return
    const controller = new AbortController()
    let draftObserver: MutationObserver | undefined
    const publish = (data: T | null, error: string, status: number | null) => {
      if (controller.signal.aborted) return
      // A refresh started before typing must not replace the record and remount its form.
      const editing = protectDraft && revision > 0 && hasDraft()
      if (editing) {
        draftObserver = new MutationObserver(() => {
          if (hasDraft()) return
          draftObserver?.disconnect()
          refresh()
        })
        draftObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-wdp-dirty', 'data-wdp-submitting'] })
      }
      setResult(previous => editing && previous?.key === key && previous.data !== null
        ? { ...previous, revision, error, status }
        : { key, revision, data, error, status })
    }
    apiRequest<T>(path, { signal: controller.signal })
      .then(data => publish(data, '', null))
      .catch(caught => {
        publish(null, caught instanceof Error ? caught.message : 'Không thể tải dữ liệu.', caught instanceof ApiError ? caught.status : null)
      })
    return () => { controller.abort(); draftObserver?.disconnect() }
  }, [path, key, revision, protectDraft, refresh])
  const current = path && result?.key === key ? result : null
  return { data: current?.data ?? null, error: current?.error ?? '', status: current?.status ?? null, loading: Boolean(path && !current), refreshing: Boolean(current && current.revision !== revision), refresh }
}
