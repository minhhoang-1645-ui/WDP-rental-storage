import { useEffect, useRef } from 'react'

export function useDialog(open: boolean, busy: boolean, onClose: () => void) {
  const ref = useRef<HTMLElement>(null)
  const controls = useRef({ busy, onClose })
  useEffect(() => { controls.current = { busy, onClose } }, [busy, onClose])
  useEffect(() => {
    if (!open || !ref.current) return
    const dialog = ref.current, previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button, input:not([type="hidden"]), select, textarea, a[href], [tabindex]')).filter(item => item.tabIndex >= 0 && !item.matches(':disabled') && item.getClientRects().length > 0)
    const frame = requestAnimationFrame(() => (dialog.querySelector<HTMLElement>('input:not(:disabled), textarea:not(:disabled)') ?? focusable()[0] ?? dialog).focus())
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (!controls.current.busy) controls.current.onClose() }
      if (event.key !== 'Tab') return
      const elements = focusable(), first = elements[0], last = elements.at(-1)
      if (!first) { event.preventDefault(); dialog.focus(); return }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', keydown); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus() }
  }, [open])
  return ref
}
