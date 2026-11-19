import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { Box, ExternalLink, Smartphone } from 'lucide-react'
import { customerBillingApi } from '../../services/billing'

export function MobileVnpayReturnPage() {
  const { invoiceId = '' } = useParams()
  const { search } = useLocation()
  const [processedSearch, setProcessedSearch] = useState('')
  const ref = new URLSearchParams(search).get('vnp_TxnRef') ?? ''
  const valid = /^[a-zA-Z0-9_-]{1,100}$/.test(invoiceId) && /^[a-zA-Z0-9_-]{1,100}$/.test(ref)
  const path = 'customer/payment-result?invoiceId=' + encodeURIComponent(invoiceId) + '&transaction=' + encodeURIComponent(ref)
  const appUrl = valid ? 'wdp-storage://' + path : 'wdp-storage://customer/invoices'

  useEffect(() => {
    if (!search) return
    const controller = new AbortController()
    let mounted = true
    const timeout = window.setTimeout(() => controller.abort(), 5000)
    void customerBillingApi.vnpayReturn(search.slice(1), controller.signal)
      .catch(() => undefined).finally(() => {
        window.clearTimeout(timeout)
        if (mounted) setProcessedSearch(search)
      })
    return () => { mounted = false; window.clearTimeout(timeout); controller.abort() }
  }, [search])

  return <main className="nestbox-mobile-return">
    <header><Box size={28} /> NestBox</header>
    <div className="nestbox-mobile-return-icon"><Smartphone size={67} strokeWidth={1.5} /></div>
    <h1>Quay lại NestBox</h1>
    <p>Mở ứng dụng để kiểm tra kết quả thanh toán.</p>
    {processedSearch === search ? <a href={appUrl}><ExternalLink size={19} /> Mở ứng dụng NestBox</a>
      : <p role="status">Đang tiếp nhận kết quả từ VNPay…</p>}
    <details><summary>Không mở được ứng dụng?</summary>
      <p>Hãy mở NestBox và vào Thanh toán → Hóa đơn để kiểm tra kết quả.</p>
    </details>
  </main>
}
