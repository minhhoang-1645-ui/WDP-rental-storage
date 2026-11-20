import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { StoredItem, StoredItemMovement } from '../../types/stock';
import { useApiResource } from '../../services/useApiResource';
import { date, type Page } from '../manager/portal-data';
import { Facts, LoadState, Modal } from '../manager/PortalUi';
import { DetailDisclosure } from '../workspace/DetailDisclosure';
import { InternalPagination } from '../workspace/InternalPagination';
import { CopyRecordCode } from '../workspace/RecordIdentity';

export function StoredItemDetail({ item, movements, onClose, staffId }: { item: StoredItem; movements: string; onClose: () => void; staffId?: string }) {
  const storage = item.currentStorageUnit ?? item.storageUnit;
  const contract = item.rentalContract;
  if (staffId) {
    const location = [storage?.unitNumber, storage?.floor, storage?.zone].filter(Boolean).join(' · ');
    const facts: Array<[string, string]> = [];
    if (location) facts.push(['Kho hiện tại', location]);
    if (item.customer?.fullName) facts.push(['Khách thuê', item.customer.fullName]);
    if (contract?.contractCode) facts.push(['Hợp đồng', contract.contractCode]);
    return <Modal className="staff-stored-item-dialog" title={item.name} onClose={onClose} footer={<button type="button" className="button-secondary" onClick={onClose}>Đóng</button>}>
      <CopyRecordCode value={item.itemCode} label="Mã hàng" />
      <dl className="stored-item-quantity"><dt>Số lượng đang lưu</dt><dd>{item.balance.toLocaleString('vi-VN')} {item.unit}</dd></dl>
      {facts.length > 0 && <Facts items={facts} />}
      <StoredItemHistory itemId={item.id} staffId={staffId} />
    </Modal>;
  }
  return <Modal title={item.name} onClose={onClose} footer={<button type="button" className="button-secondary" onClick={onClose}>Đóng</button>}>
    <CopyRecordCode value={item.itemCode} label="Mã hàng" />
    <Facts items={[
      ['Kho hiện tại', [storage?.unitNumber, storage?.floor, storage?.zone].filter(Boolean).join(' · ') || 'Chưa có vị trí'],
      ['Số lượng đang lưu', `${item.balance.toLocaleString('vi-VN')} ${item.unit}`],
      ['Hợp đồng', contract?.contractCode],
      ...(item.customer ? [['Khách hàng', item.customer.fullName] as [string, string]] : []),
      ...(item.note ? [['Ghi chú', item.note] as [string, string]] : []),
    ]} />
    {contract?.id && <Link className="portal-text-button" to={movements + '?' + new URLSearchParams({ rentalContractId: contract.id })}>Xem phiếu nhập – xuất của hợp đồng</Link>}
  </Modal>;
}

function StoredItemHistory({ itemId, staffId }: { itemId: string; staffId: string }) {
  const { pathname, search, hash } = useLocation();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 5;
  const url = open ? `/staff/stored-items/${encodeURIComponent(itemId)}/history?page=${page}&limit=${limit}` : null;
  const data = useApiResource<Page<StoredItemMovement>>(url, staffId);
  return <DetailDisclosure title="Lịch sử nhập – xuất" onToggle={setOpen}>
    {open && <>
      <LoadState loading={data.loading} error={data.error ? 'Không tải được lịch sử nhập – xuất. Vui lòng thử lại.' : ''} retry={data.refresh} />
      {data.data?.total === 0 && <p>Chưa có giao dịch nhập – xuất trong phạm vi truy cập.</p>}
      {!!data.data?.items.length && <table className="stored-item-history-table" aria-label="Giao dịch của mặt hàng">
        <thead><tr><th scope="col">Thời gian</th><th scope="col">Loại</th><th scope="col">Số lượng</th><th scope="col">Phiếu</th></tr></thead>
        <tbody>{data.data.items.map(row => <tr key={row.id}>
          <td><time dateTime={row.completedAt}>{date(row.completedAt, true)}</time></td>
          <td>{row.type === 'IN' ? 'Nhập' : 'Xuất'}</td>
          <td>{row.actualQty === 0 ? '' : row.type === 'IN' ? '+' : '−'}{row.actualQty.toLocaleString('vi-VN')} {row.unit}</td>
          <td>{row.movementId
            ? <Link to={`/staff/stock-movements/${encodeURIComponent(row.movementId)}`} state={{ returnTo: pathname + search + hash }}>{row.movementCode}</Link>
            : row.movementCode}</td>
        </tr>)}</tbody>
      </table>}
      {data.data && (data.data.total > limit || page > 1) &&
        <InternalPagination page={page} limit={limit} total={data.data.total} onChange={setPage} />}
    </>}
  </DetailDisclosure>;
}
