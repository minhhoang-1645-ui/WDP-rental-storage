import { FileText, RefreshCw } from 'lucide-react'
import { useAuth } from '../../auth/auth-context'
import { CustomerSessionExpired } from '../../components/customer/CustomerSessionExpired'
import { formatPortalDate } from '../../components/customer/CustomerPortalHelpers'
import { CustomerStatus, PortalEmpty, PortalError, PortalLoading, PortalPageHeader } from '../../components/customer/CustomerPortalUi'
import { useApiResource } from '../../services/useApiResource'
import type { CustomerContract, Paginated } from '../../types/customer'

export function CustomerContractsPage() {
  const { user } = useAuth()
  const { data, error, status, loading, refresh } = useApiResource<Paginated<CustomerContract>>('/customer/contracts?limit=100', user?.id ?? '', true)
  const contracts = data?.items ?? []
  return <section className="customer-page">
    <PortalPageHeader eyebrow="Hợp đồng" title="Hợp đồng của tôi" description="Theo dõi hợp đồng và kho vật lý được cấp cho từng hợp đồng." action={<button className="button-secondary" type="button" onClick={refresh} disabled={loading}><RefreshCw size={16} /> Làm mới</button>} />
    {status === 401 ? <CustomerSessionExpired /> : loading ? <PortalLoading label="Đang tải hợp đồng…" /> : error ? <PortalError message={error} onRetry={refresh} /> : contracts.length === 0 ? <PortalEmpty icon={<FileText size={30} />} title="Chưa có hợp đồng"><span>Hợp đồng sẽ xuất hiện sau khi reservation được WDP xác nhận và cấp kho.</span></PortalEmpty> : <div className="customer-table-wrap"><table className="customer-table"><thead><tr><th>Mã hợp đồng</th><th>Loại kho</th><th>Kho được cấp</th><th>Thời hạn</th><th>Trạng thái</th></tr></thead><tbody>{contracts.map(contract => <tr key={contract.id}><td><strong>{contract.contractCode}</strong><small>{contract.reservation.reference}</small></td><td>{contract.storageType.name}</td><td><strong>{contract.storageUnit.unitCode}</strong><small>{[contract.storageUnit.floor, contract.storageUnit.zone].filter(Boolean).join(' · ')}</small></td><td>{formatPortalDate(contract.startDate)} – {formatPortalDate(contract.endDate)}</td><td><CustomerStatus status={contract.status} /></td></tr>)}</tbody></table></div>}
  </section>
}
