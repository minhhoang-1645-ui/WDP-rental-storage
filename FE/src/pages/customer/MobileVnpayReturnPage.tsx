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
  const appUrl = valid ? 'wdp-storage://' + path : 'wdp-storage://customer'

  useEffect(() => {
    if (!search) return
    const controller = new AbortController()
    let mounted = true
    const timeout = window.setTimeout(() => controller.abort(), 5000)
    void customerBillingApi.vnpayReturn(search.slice(1), controller.signal)
      .then(result => {
        if (mounted && valid && result.valid) window.location.assign(appUrl)
      })
      .catch(() => undefined).finally(() => {
        window.clearTimeout(timeout)
        if (mounted) setProcessedSearch(search)
      })
    return () => { mounted = false; window.clearTimeout(timeout); controller.abort() }
  }, [appUrl, search, valid])

  return <main className="nestbox-mobile-return">
    <header><Box size={28} /> NestBox</header>
    <div className="nestbox-mobile-return-icon"><Smartphone size={67} strokeWidth={1.5} /></div>
    <h1>Quay lại NestBox</h1>
    <p>Ứng dụng sẽ mở để xác nhận giao dịch và đưa bạn về trang chủ khi thanh toán thành công.</p>
    {processedSearch === search ? <a href={appUrl}><ExternalLink size={19} /> Quay về ứng dụng NestBox</a>
      : <p role="status">Đang tiếp nhận kết quả từ VNPay…</p>}
    <details><summary>Không mở được ứng dụng?</summary>
      <p>Đóng cửa sổ VNPay để quay lại NestBox. Bạn có thể kiểm tra giao dịch trong mục Thanh toán → Hóa đơn.</p>
    </details>
  </main>
}
