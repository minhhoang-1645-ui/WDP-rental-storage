import { CalendarClock, Plus, RefreshCw, Warehouse } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { CustomerSessionExpired } from '../../components/customer/CustomerSessionExpired'
import { formatPortalDate, moneyLabel } from '../../components/customer/CustomerPortalHelpers'
import { CustomerStatus, PortalEmpty, PortalError, PortalLoading, PortalPageHeader } from '../../components/customer/CustomerPortalUi'
import { useApiResource } from '../../services/useApiResource'
import type { CustomerRental, Paginated } from '../../types/customer'

export function CustomerRentalsPage() {
  const { user } = useAuth()
  const { data, error, status, loading, refresh } = useApiResource<Paginated<CustomerRental>>('/customer/rentals?limit=100', user?.id ?? '', true)
  const rentals = data?.items ?? []

  return <section className="customer-page">
    <PortalPageHeader eyebrow="Kho đang thuê" title="Kho của tôi" description="Theo dõi kho đã bàn giao, thời hạn thuê và số dư hóa đơn." action={<div className="customer-header-actions"><button className="button-secondary" type="button" onClick={refresh} disabled={loading}><RefreshCw size={16} /> Làm mới</button><Link className="button-primary" to="/booking"><Plus size={17} /> Đặt thêm kho</Link></div>} />
    {status === 401 ? <CustomerSessionExpired /> : loading ? <PortalLoading label="Đang tải kho đang thuê…" /> : error ? <PortalError message={error} onRetry={refresh} /> : rentals.length === 0 ? <PortalEmpty icon={<Warehouse size={30} />} title="Chưa có kho đang thuê"><span>Kho sẽ xuất hiện sau khi hợp đồng được kích hoạt và hoàn tất bàn giao.</span></PortalEmpty> : <div className="customer-card-list">
      {rentals.map(rental => <article className="customer-panel customer-record-card" key={rental.reservationId}>
        <div className="customer-record-heading"><div><small>{rental.reservationReference}</small><h2>{rental.storageType.name}</h2></div><CustomerStatus status={rental.rentalState} /></div>
        <dl className="customer-record-facts"><div><dt>Thời hạn</dt><dd><CalendarClock size={15} /> {formatPortalDate(rental.startDate)} – {formatPortalDate(rental.effectiveEndDate)}</dd></div><div><dt>Số kho</dt><dd>{rental.unitCount}</dd></div><div><dt>Còn phải trả</dt><dd>{moneyLabel(rental.billingSummary.totalOutstanding)}</dd></div></dl>
        <div className="customer-unit-list">{rental.contracts.map(contract => <div key={contract.id}><span><strong>{contract.unit.unitCode}</strong><small>{[contract.unit.floor, contract.unit.zone].filter(Boolean).join(' · ') || 'Chưa có vị trí chi tiết'}</small></span><CustomerStatus status={contract.status} /></div>)}</div>
        {rental.pendingRenewal && <p className="customer-inline-notice">Yêu cầu gia hạn {rental.pendingRenewal.renewalCode} đang được xử lý đến ngày {formatPortalDate(rental.pendingRenewal.requestedEndDate)}.</p>}
      </article>)}
    </div>}
  </section>
}
