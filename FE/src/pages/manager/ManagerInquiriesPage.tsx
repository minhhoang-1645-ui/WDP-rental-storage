import { ArrowRight, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { useApiResource } from '../../services/useApiResource'
import type { ManagerInquiry, ManagerRequestStatus } from '../../types/booking'

const statusLabels: Record<ManagerRequestStatus, string> = {
  PENDING_CONTACT: 'Chờ liên hệ',
  CONTACTED: 'Đã liên hệ',
  IN_REVIEW: 'Đang xử lý',
  CLOSED: 'Đã đóng',
  CANCELLED: 'Đã hủy',
  PENDING: 'Chờ xử lý',
  EXPIRED: 'Đã hết hạn',
}

export function ManagerInquiriesPage() {
  const { user } = useAuth()
  const [page, setPage] = useState(1)
  const limit = 20
  const path = `/manager/inquiries?page=${page}&limit=${limit}`
  const { data, error, loading, refresh } = useApiResource<{ page: number; limit: number; total: number; items: ManagerInquiry[] }>(path, user?.id ?? '')
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit))
  return <section>
    <header className="manager-page-header"><div><p className="eyebrow">Vận hành</p><h1>Yêu cầu khách hàng</h1><p>Inquiry và Reservation đều chưa thanh toán, chưa tạo hợp đồng hoặc phân kho vật lý.</p></div><button className="button-secondary" onClick={refresh} disabled={loading}><RefreshCw size={16} /> Làm mới</button></header>
    {error ? <div className="booking-alert is-error" role="alert">{error}</div> : loading ? <p role="status">Đang tải yêu cầu…</p> : data?.items.length ? <>
      <div className="manager-table-wrap"><table className="manager-table"><thead><tr><th>Mã</th><th>Khách hàng</th><th>Kho yêu cầu</th><th>Thời gian</th><th>Trạng thái</th><th><span className="sr-only">Mở</span></th></tr></thead><tbody>{data.items.map((item) => <tr key={item.id}><td><strong>{item.reference}</strong><small>{item.requestType === 'INQUIRY' ? 'Inquiry' : 'Reservation'} · {new Date(item.createdAt).toLocaleString('vi-VN')}</small></td><td><strong>{item.customer.fullName}</strong><small>{item.customer.phone}</small></td><td><strong>{item.product.name}</strong><small>{item.quantity} kho · {item.product.code}</small></td><td><span>{item.startDate}</span><small>đến {item.endDateExclusive}</small></td><td><span className={'manager-status is-' + item.status.toLowerCase()}>{statusLabels[item.status]}</span></td><td><Link className="manager-open" to={'/manager/inquiries/' + item.id} aria-label={'Mở ' + item.id}><ArrowRight size={18} /></Link></td></tr>)}</tbody></table></div>
      <div className="manager-pagination"><span>Trang {page}/{totalPages} · {data.total} yêu cầu</span><div><button className="button-secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Trước</button><button className="button-secondary" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Sau</button></div></div>
    </> : <div className="manager-empty"><h2>Chưa có yêu cầu khách hàng</h2><p>Inquiry và Reservation mới sẽ xuất hiện tại đây.</p></div>}
  </section>
}
