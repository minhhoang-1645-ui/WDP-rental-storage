import { useAuth } from '../../auth/auth-context'
import { usePaginatedResource } from '../../services/usePaginatedResource'
import { isTransferRequest } from '../../utils/transfer-request'
import { code, customer, first, type Row } from './portal-data'
import { Status } from './PortalUi'
import { OperationsLink as Link } from './OperationsLink'
import { useState } from 'react'
import { mutate } from '../../services/portal'

/** Customer transfer requests use SupportRequest in the existing BE; surface them in the transfer workspace. */
export function TransferRequests({ onCreate, revision = 0 }: { onCreate: (row: Row) => void; revision?: number }) {
  const { user } = useAuth()
  const requests = usePaginatedResource<Row>('/manager/support-requests?limit=100', `${user?.id}:${revision}`, true)
  const transfers = usePaginatedResource<Row>('/manager/transfers?limit=100', `${user?.id}:${revision}`, true)
  const linked = new Map((transfers.data?.items ?? []).filter(row => first(row, 'supportRequest.id')).map(row => [first(row, 'supportRequest.id'), row]))
  const pending = (requests.data?.items ?? []).filter(row => isTransferRequest(row) && (!linked.has(first(row, 'id')) || linked.get(first(row, 'id'))?.status === 'REJECTED') && (row.status !== 'RESOLVED' || row.resolutionType === 'TRANSFER_RECOMMENDED'))
  return <section className="manager-section transfer-request-inbox" aria-label="Yêu cầu chuyển kho từ khách hàng">
    <h2>Yêu cầu chuyển kho từ khách hàng</h2><p>Tiếp nhận yêu cầu, đối chiếu hợp đồng và tạo lệnh chuyển. Các lệnh đã tạo nằm ở danh sách bên dưới.</p>
    {(requests.loading || transfers.loading) ? <p role="status">Đang đối chiếu yêu cầu chuyển kho…</p> : requests.error || transfers.error ? <div role="alert"><p>{requests.error || transfers.error}</p><button className="button-secondary" onClick={() => { requests.refresh(); transfers.refresh() }}>Thử lại yêu cầu chuyển kho</button></div> : !pending.length ? <p>Không có yêu cầu mới cần tạo lệnh chuyển.</p> : <div className="transfer-request-cards">{pending.map(row => {
      const person = customer(row)
      return <article key={first(row, 'id')}><div><strong>{first(person, 'fullName') || 'Khách hàng'} · {first(person, 'phone', 'email')}</strong><p>{first(row, 'subject')} · {row.status === 'RESOLVED' ? <span>Đã đề xuất chuyển · Chưa tạo lệnh</span> : <Status value={row.status} />}</p><small>{code(row)} · {first(row, 'reservation.reference')} · Kho {first(row, 'unit.unitCode', 'storageUnit.unitNumber') || 'Chưa chọn'}</small><p>{first(row, 'description')}</p><small>Phụ trách: {first(row, 'assignedStaff.fullName') || 'Chưa phân công'}</small></div><div className="portal-actions"><button className="button-primary" onClick={() => onCreate(row)}>Tiếp nhận chuyển kho</button><Link className="button-secondary" to={`/manager/operations/support-requests/${encodeURIComponent(first(row, 'id'))}`}>Xem yêu cầu gốc</Link></div></article>
    })}</div>}
  </section>
}

export function TransferSupportAction({ row, onCreate }: { row: Row; onCreate: () => void }) {
  const { user } = useAuth()
  const transfers = usePaginatedResource<Row>('/manager/transfers?limit=100', user?.id ?? '', true)
  const linked = transfers.data?.items.find(item => first(item, 'supportRequest.id') === first(row, 'id') && item.status !== 'REJECTED')
  return <section className="manager-section transfer-request-inbox"><h2>Yêu cầu chuyển kho</h2>{transfers.loading ? <p role="status">Đang kiểm tra lệnh chuyển liên quan…</p> : transfers.error ? <><p role="alert">{transfers.error}</p><button className="button-secondary" onClick={transfers.refresh}>Thử lại lệnh chuyển</button></> : linked ? <><p>Lệnh {code(linked)} · <Status value={linked.status} /></p><Link className="button-primary" to={`/manager/operations/transfers/${encodeURIComponent(first(linked, 'id'))}`}>Mở lệnh chuyển kho</Link></> : <><p>Tạo lệnh chuyển gắn với hồ sơ này để chọn kho đích, duyệt và hoàn tất bàn giao. Hoàn tất hỗ trợ không tự tạo lệnh chuyển.</p><button className="button-primary" onClick={onCreate}>Tạo lệnh chuyển từ yêu cầu này</button></>}<Link className="comparison-detail" to="/manager/operations/transfers">Theo dõi chuyển kho</Link></section>
}

export function CompletedTransferSync({ row, refresh }: { row: Row; refresh: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const supportId = first(row, 'supportRequest.id')
  const synced = !supportId || first(row, 'supportRequest.status') === 'RESOLVED' && first(row, 'supportRequest.resolutionType') !== 'TRANSFER_RECOMMENDED'
  const needsSync = !synced || row.sourceMaintenanceMissing === true
  const sync = async () => { if (busy) return; setBusy(true); setError(''); try { await mutate(`/staff/transfers/${encodeURIComponent(first(row, 'id'))}/complete`, 'POST', undefined, true); refresh() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Chưa đồng bộ được kết quả. Vui lòng thử lại.') } finally { setBusy(false) } }
  return <section className="manager-section"><h2>Kết quả gửi khách hàng</h2><p>{synced ? supportId ? 'Đã hoàn tất chuyển kho và cập nhật yêu cầu của khách.' : 'Lệnh chuyển kho đã hoàn tất.' : 'Lệnh chuyển đã hoàn tất. Đồng bộ hồ sơ cũ để yêu cầu của khách nhận đúng kết quả; thao tác này không chuyển kho lần nữa.'}</p>{needsSync && <button className="button-primary" disabled={busy} onClick={() => void sync()}>{busy ? 'Đang đồng bộ…' : synced ? 'Đồng bộ bảo trì kho nguồn' : 'Đồng bộ kết quả cho khách'}</button>}{error && <p role="alert">{error}</p>}<p>{first(row, 'fromUnit.status') === 'MAINTENANCE' ? 'Kho nguồn được giữ để kiểm tra và sửa chữa; chỉ đưa vào sử dụng lại sau nghiệm thu.' : 'Kho nguồn được quản lý theo trạng thái hiện tại; đồng bộ hồ sơ cũ không thay đổi lại trạng thái vật lý.'}</p>{row.sourceMaintenanceMissing === true && <p>Hồ sơ cũ chưa có phiếu bảo trì kho nguồn. Dùng nút đồng bộ để bổ sung phiếu.</p>}{first(row, 'sourceMaintenance.id') && <Link className="button-secondary" to={`/manager/operations/maintenance/${encodeURIComponent(first(row, 'sourceMaintenance.id'))}`}>Xem bảo trì kho nguồn · {first(row, 'sourceMaintenance.maintenanceCode')}</Link>}{supportId && <Link className="comparison-detail" to={`/manager/operations/support-requests/${encodeURIComponent(supportId)}`}>Xem yêu cầu của khách</Link>}</section>
}
