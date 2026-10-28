import { createContext, useContext } from 'react'

export const StorageComparisonContext = createContext<{ ids: string[]; toggle: (id: string) => void; clear: () => void } | null>(null)
export function useStorageComparison() { const value = useContext(StorageComparisonContext); if (!value) throw new Error('StorageComparisonProvider is required'); return value }
export function comparisonHref(ids: string[], search = '') { const params = new URLSearchParams(search); params.set('compare', ids.join(',')); return `/size-guide?${params}` }
