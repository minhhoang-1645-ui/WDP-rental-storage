import { ArrowRightLeft, CircleHelp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { CustomerSessionExpired } from '../../components/customer/CustomerSessionExpired'
import { formatPortalDate } from '../../components/customer/CustomerPortalHelpers'
import { CustomerStatus, PortalEmpty, PortalError, PortalLoading, PortalPageHeader } from '../../components/customer/CustomerPortalUi'
import { useApiResource } from '../../services/useApiResource'
import type { CustomerSupportRequest, Paginated } from '../../types/customer'

export function CustomerTransfersPage() {
  const { user } = useAuth()
  const requests = useApiResource<Paginated<CustomerSupportRequest>>('/customer/support-requests?limit=100', user?.id ?? '', true)
  const transferRequests = (requests.data?.items ?? []).filter(item => item.resolutionType === 'TRANSFER_RECOMMENDED' || item.subject.toLocaleLowerCase('vi').includes('chuyển kho'))
  return <section className="customer-page">
    <PortalPageHeader eyebrow="Chuyển đổi kho" title="Yêu cầu chuyển kho" description="Customer báo nhu cầu qua hỗ trợ; WDP kiểm tra và Manager tạo lệnh chuyển kho khi phù hợp." action={<Link className="button-primary" to="/customer/support?category=UNIT_ISSUE&subject=Yêu cầu chuyển kho"><CircleHelp size={17} /> Gửi yêu cầu</Link>} />
    <div className="customer-inline-notice customer-transfer-note"><strong>Quy trình:</strong> Gửi yêu cầu hỗ trợ → WDP kiểm tra kho hiện tại → Manager duyệt kho đích → Staff hoàn tất chuyển kho. Customer không tự đổi kho vật lý trực tiếp.</div>
    {requests.status === 401 ? <CustomerSessionExpired /> : requests.loading ? <PortalLoading label="Đang tải yêu cầu chuyển kho…" /> : requests.error ? <PortalError message={requests.error} onRetry={requests.refresh} /> : transferRequests.length === 0 ? <PortalEmpty icon={<ArrowRightLeft size={30} />} title="Chưa có yêu cầu chuyển kho"><span>Nếu kho gặp vấn đề hoặc cần đổi vị trí, hãy gửi yêu cầu để WDP đánh giá.</span><Link className="button-primary" to="/customer/support?category=UNIT_ISSUE&subject=Yêu cầu chuyển kho">Tạo yêu cầu hỗ trợ</Link></PortalEmpty> : <div className="customer-card-list">{transferRequests.map(item => <article className="customer-panel customer-record-card" key={item.id}><div className="customer-record-heading"><div><small>{item.supportCode} · {formatPortalDate(item.createdAt, true)}</small><h2>{item.subject}</h2></div><CustomerStatus status={item.status} label={item.status === 'OPEN' ? 'Đang mở' : undefined} /></div><p>{item.reservation.reference}{item.unit ? ` · Kho ${item.unit.unitCode}` : ''}</p>{item.resolutionNote && <p className="customer-inline-notice">{item.resolutionNote}</p>}</article>)}</div>}
  </section>
}
