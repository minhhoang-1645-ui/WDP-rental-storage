import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

export function usePublicNavigation() {
  const { pathname, hash } = useLocation(), navigation = useNavigationType()
  useEffect(() => {
    const main = document.getElementById('public-main')
    if (!main) return
    let section: string
    try { section = decodeURIComponent(hash.slice(1)) } catch { section = '' }
    let reached = false
    const update = () => {
      const heading = main.querySelector('h1')?.textContent?.trim()
      if (heading) document.title = `${heading} | WDP Storage`
      const target = section ? document.getElementById(section) : undefined
      if (target && !reached) { target.scrollIntoView({ block: 'start' }); reached = true }
    }
    if (!hash && navigation !== 'POP') { window.scrollTo(0, 0); main.focus({ preventScroll: true }) }
    update()
    const observer = new MutationObserver(update)
    observer.observe(main, { subtree: true, childList: true })
    return () => observer.disconnect()
  }, [pathname, hash, navigation])
}
