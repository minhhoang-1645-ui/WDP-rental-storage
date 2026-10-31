import { first, object, rows, date, label } from '../manager/portal-data';
import { DocumentFile } from './DocumentFile';

export function ContractTransferHistory({ contract: value, scope }: { contract: unknown; scope: 'customer' | 'manager' | 'staff/management' }) {
  const contract = object(value), transfers = rows(contract.transfers);
  if (!transfers.length) return null;
  return <section className="customer-panel" aria-label="Lịch sử chuyển kho của hợp đồng">
    <h2>Lịch sử chuyển kho của hợp đồng</h2>
    <p>Kho hiện tại: <strong>{first(contract, 'storageUnit.unitCode')}</strong>. Bản hợp đồng đã ký giữ nguyên; mỗi lần chuyển hoàn tất có biên bản đính kèm để đối chiếu kho cũ và kho mới.</p>
    {transfers.map(transfer => <article className="transfer-destination-context" key={first(transfer, 'id')}>
      <strong>{first(transfer, 'transferCode')} · {label(transfer.status)}</strong>
      <p><strong>{first(transfer, 'fromUnit.unitCode')}</strong> → <strong>{first(transfer, 'toUnit.unitCode') || 'Chưa chọn kho đích'}</strong></p>
      <small>Lý do: {label(transfer.reason)} · Lập ngày {date(transfer.createdAt, true)}</small>
      {transfer.status === 'COMPLETED' ? <>
        <p>Đã chuyển thực tế: {date(transfer.completedAt, true)} · Người xác nhận: {first(transfer, 'completedBy.fullName') || 'Chưa ghi nhận'}</p>
        <DocumentFile path={`/${scope}/documents/contracts/${encodeURIComponent(first(contract, 'id'))}/transfers/${encodeURIComponent(first(transfer, 'id'))}`} name={`${first(transfer, 'transferCode')}-BB`} description="Biên bản ghi nhận chuyển kho đính kèm hợp đồng; không phải lần ký mới của khách." />
      </> : <p>{transfer.status === 'APPROVED' ? 'Đã giữ kho đích, chờ chuyển và xác nhận thực tế. Kho sử dụng chưa thay đổi.' : transfer.status === 'REJECTED' ? 'Yêu cầu đã bị từ chối; không thay đổi kho thuê.' : 'Đang lựa chọn và kiểm tra kho đích; chưa chuyển kho.'}</p>}
    </article>)}
  </section>;
}
