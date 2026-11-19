import { useLayoutEffect, useRef, useState } from 'react';
import { DetailRow } from '../../components/workspace/DetailRow';
import { StoredItemDetail } from '../../components/stock/StoredItemDetail';
import { StaffTaskPagination, StaffTaskTable, type StaffColumn } from '../../components/workspace/StaffTaskTable';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { internalPageSize } from '../../utils/internal-pagination';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { PageHeader, LoadState, Empty, Pagination } from '../../components/manager/PortalUi';
import type { Page } from '../../components/manager/portal-data';
import { useApiResource } from '../../services/useApiResource';
import type { StockStorageUnit, StoredItem } from '../../types/stock';

export function OperationalStoredItemsPage({ role }: { role: 'STAFF' | 'MANAGER' }) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const pendingParams = useRef(params);
  useLayoutEffect(() => { pendingParams.current = params; }, [params]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const staff = role === 'STAFF';
  const limit = internalPageSize(params);
  const page = Math.max(1, Math.floor(Number(params.get('page')) || 1));
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  for (const key of ['search', 'storageUnitId']) if (params.get(key)) query.set(key, params.get(key)!);
  const root = role.toLowerCase();
  const data = useApiResource<Page<StoredItem> & { selectedStorageUnit?: StockStorageUnit }>(`/${root}/stored-items?${query}`, user?.id, true);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(pendingParams.current);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    if (next.toString() === pendingParams.current.toString()) return;
    pendingParams.current = next;
    setParams(next, { replace: true });
  };
  const items = data.data?.items ?? [];
  const selected = items.find(item => item.id === selectedId);
  const selectedUnit = data.data?.selectedStorageUnit;
  const error = staff && data.error
    ? data.status === 403 && params.has('storageUnitId')
      ? 'Bạn không có quyền xem hàng tại kho này.'
      : 'Không tải được danh sách hàng. Vui lòng thử lại.'
    : data.error;
  const columns: StaffColumn<StoredItem>[] = [
    { key: 'item', label: 'Mặt hàng', cell: item => <><strong>{item.name}</strong><CopyRecordCode value={item.itemCode} label="Mã hàng" /></> },
    { key: 'unit', label: 'Kho hiện tại', cell: item => item.currentStorageUnit ? <>
      <button type="button" className="portal-text-button" onClick={() => update('storageUnitId', item.currentStorageUnit!.id)}>{item.currentStorageUnit.unitNumber}</button>
      {(item.currentStorageUnit.floor || item.currentStorageUnit.zone) && <small>{[item.currentStorageUnit.floor, item.currentStorageUnit.zone].filter(Boolean).join(' · ')}</small>}
    </> : 'Chưa có vị trí' },
    { key: 'customer', label: 'Khách thuê', cell: item => item.customer?.fullName || '—' },
    { key: 'balance', label: 'Đang lưu', numeric: true, cell: item => `${item.balance.toLocaleString('vi-VN')} ${item.unit}` },
  ];
  const detail = (item: StoredItem) => ({ open: () => setSelectedId(item.id), label: `Xem mặt hàng ${item.name} · ${item.itemCode}` });
  const ListPagination = staff ? StaffTaskPagination : Pagination;
  return (
    <section>
      <PageHeader title={staff ? "Hàng đang lưu" : "Hàng đang lưu theo kho"} description={staff ? undefined : "Vị trí hiện tại theo hợp đồng, cập nhật khi hoàn tất chuyển kho. Phiếu lịch sử có vị trí riêng tại lúc hoàn tất."}>
        <Link className="button-secondary" to={role === 'STAFF' ? '/staff/stock-movements' : '/manager/operations/stock-movements'}>Phiếu nhập – xuất</Link>
        <button className="button-secondary" onClick={data.refresh}>Làm mới</button>
      </PageHeader>
      <div className={`portal-toolbar${staff ? " staff-table-toolbar" : ""}`}>
        <label className={`field-label${staff ? " portal-search" : ""}`}>{staff ? 'Tìm hàng đang lưu' : 'Tìm mã kho, tên hàng hoặc khách hàng'}<input type="search" placeholder={staff ? 'Tìm mặt hàng, kho hoặc khách hàng...' : undefined} maxLength={100} value={params.get('search') ?? ''} onChange={event => update('search', event.target.value)} /></label>
        {params.get('storageUnitId') && <div className="stored-item-unit-filter">
          {selectedUnit && <span>Đang xem: <strong>Kho {selectedUnit.unitNumber}</strong></span>}
          <button type="button" className="button-secondary" onClick={() => update('storageUnitId', '')}>{staff ? 'Bỏ lọc' : 'Bỏ lọc kho'}</button>
        </div>}
      </div>
      <LoadState loading={data.loading} error={error} retry={data.refresh}
        placeholder={staff ? <StaffTaskTable title="Hàng đang lưu" items={[]} columns={columns} rowKey={row => row.id} loadingRows={5} /> : undefined} />
      {!data.loading && !data.error && <>
        {!items.length && <Empty title={staff ? (params.get('search')?.trim() ? 'Không tìm thấy mặt hàng phù hợp.' : 'Không có hàng đang lưu.') : 'Chưa có hàng tồn phù hợp'} />}
        {staff ? (items.length > 0 && <StaffTaskTable title="Hàng đang lưu" items={items} columns={columns} rowKey={row => row.id} rowDetail={detail} />) :
        <div className="manager-table-wrap"><table className="manager-table">
          <thead><tr><th>Kho hiện tại</th><th>Khách thuê</th><th>Mặt hàng</th><th>Tồn</th><th>Lịch sử</th></tr></thead>
          <tbody>{data.data?.items.map(item => <DetailRow key={item.id} detail={detail(item)}>
            <td>{item.currentStorageUnit ? <><button className="portal-text-button" onClick={() => update('storageUnitId', item.currentStorageUnit!.id)}>{item.currentStorageUnit.unitNumber}</button><p>{[item.currentStorageUnit.floor, item.currentStorageUnit.zone].filter(Boolean).join(' · ')}</p></> : 'Chưa có vị trí'}</td>
            <td>{item.customer?.fullName}<p>{item.rentalContract?.contractCode}</p></td>
            <td>{item.name}<p>{item.itemCode}</p></td>
            <td>{item.balance} {item.unit}</td><td>{item.rentalContract?.id && <Link className="portal-text-button" to={`${role === 'MANAGER' ? '/manager/operations' : '/staff'}/stock-movements?rentalContractId=${encodeURIComponent(item.rentalContract.id)}`}>Phiếu và Staff kiểm đếm</Link>}</td>
          </DetailRow>)}</tbody>
        </table></div>}
        <ListPagination page={page} limit={limit} onLimitChange={value => update('limit', String(value))} total={data.data?.total ?? 0} onChange={value => update('page', String(value))} />
      </>}
      {selected && <StoredItemDetail key={selected.id} item={selected} movements={staff ? '/staff/stock-movements' : '/manager/operations/stock-movements'} staffId={staff ? user?.id : undefined} onClose={() => setSelectedId(null)} />}
    </section>
  );
}
