import { StaffTaskPagination, StaffTaskTable, type StaffColumn } from '../../components/workspace/StaffTaskTable';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { internalPageSize, staffTaskPageSize } from '../../utils/internal-pagination';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { PageHeader, LoadState, Empty, Pagination } from '../../components/manager/PortalUi';
import type { Page } from '../../components/manager/portal-data';
import { useApiResource } from '../../services/useApiResource';
import type { StoredItem } from '../../types/stock';

export function OperationalStoredItemsPage({ role }: { role: 'STAFF' | 'MANAGER' }) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const staff = role === 'STAFF';
  const limit = staff ? staffTaskPageSize(params) : internalPageSize(params);
  const page = Math.max(1, Math.floor(Number(params.get('page')) || 1));
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  for (const key of ['search', 'storageUnitId']) if (params.get(key)) query.set(key, params.get(key)!);
  const root = role.toLowerCase();
  const data = useApiResource<Page<StoredItem>>(`/${root}/stored-items?${query}`, user?.id, true);
  const update = (key: string, value: string) => setParams(current => {
    const next = new URLSearchParams(current);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    return next;
  }, { replace: true });
  const items = data.data?.items ?? [];
  const columns: StaffColumn<StoredItem>[] = [
    { key: 'item', label: 'Mặt hàng', cell: item => <><strong>{item.name}</strong><CopyRecordCode value={item.itemCode} /></> },
    { key: 'unit', label: 'Kho hiện tại', cell: item => item.currentStorageUnit ? <>
      <button type="button" className="portal-text-button" onClick={() => update('storageUnitId', item.currentStorageUnit!.id)}>{item.currentStorageUnit.unitNumber}</button>
      <small>{[item.currentStorageUnit.floor, item.currentStorageUnit.zone].filter(Boolean).join(' · ')}</small>
    </> : 'Chưa có vị trí' },
    { key: 'customer', label: 'Khách thuê', cell: item => item.customer?.fullName || '—' },
    { key: 'balance', label: 'Tồn', numeric: true, cell: item => `${item.balance} ${item.unit}` },
    { key: 'history', label: 'Lịch sử', cell: item => item.rentalContract?.id ? <Link className="button-secondary"
      to={`/staff/stock-movements?rentalContractId=${encodeURIComponent(item.rentalContract.id)}`}>Xem phiếu</Link> : '—' },
  ];
  const ListPagination = staff ? StaffTaskPagination : Pagination;
  return (
    <section>
      <PageHeader title={staff ? "Hàng đang lưu" : "Hàng đang lưu theo kho"} description={staff ? undefined : "Vị trí hiện tại theo hợp đồng, cập nhật khi hoàn tất chuyển kho. Phiếu lịch sử có vị trí riêng tại lúc hoàn tất."}>
        <Link className="button-secondary" to={role === 'STAFF' ? '/staff/stock-movements' : '/manager/operations/stock-movements'}>Phiếu nhập – xuất</Link>
        <button className="button-secondary" onClick={data.refresh}>Làm mới</button>
      </PageHeader>
      <div className={`portal-toolbar${staff ? " staff-table-toolbar" : ""}`}>
        <label className={`field-label${staff ? " portal-search" : ""}`}>Tìm mã kho, tên hàng hoặc khách hàng<input type="search" maxLength={100} value={params.get('search') ?? ''} onChange={event => update('search', event.target.value)} /></label>
        {params.get('storageUnitId') && <button className="button-secondary" onClick={() => update('storageUnitId', '')}>Bỏ lọc kho</button>}
      </div>
      <LoadState loading={data.loading} error={data.error} retry={data.refresh}
        placeholder={staff ? <StaffTaskTable title="Hàng đang lưu" items={[]} columns={columns} rowKey={row => row.id} loadingRows={5} /> : undefined} />
      {!data.loading && !data.error && <>
        {!data.data?.items.length && <Empty title="Chưa có hàng tồn phù hợp" />}
        {staff ? (items.length > 0 && <StaffTaskTable title="Hàng đang lưu" items={items} columns={columns} rowKey={row => row.id} />) :
        <div className="manager-table-wrap"><table className="manager-table">
          <thead><tr><th>Kho hiện tại</th><th>Khách thuê</th><th>Mặt hàng</th><th>Tồn</th><th>Lịch sử</th></tr></thead>
          <tbody>{data.data?.items.map(item => <tr key={item.id}>
            <td>{item.currentStorageUnit ? <><button className="portal-text-button" onClick={() => update('storageUnitId', item.currentStorageUnit!.id)}>{item.currentStorageUnit.unitNumber}</button><p>{[item.currentStorageUnit.floor, item.currentStorageUnit.zone].filter(Boolean).join(' · ')}</p></> : 'Chưa có vị trí'}</td>
            <td>{item.customer?.fullName}<p>{item.rentalContract?.contractCode}</p></td>
            <td>{item.name}<p>{item.itemCode}</p></td>
            <td>{item.balance} {item.unit}</td><td>{item.rentalContract?.id && <Link className="portal-text-button" to={`${role === 'MANAGER' ? '/manager/operations' : '/staff'}/stock-movements?rentalContractId=${encodeURIComponent(item.rentalContract.id)}`}>Phiếu và Staff kiểm đếm</Link>}</td>
          </tr>)}</tbody>
        </table></div>}
        <ListPagination page={page} limit={limit} onLimitChange={value => update('limit', String(value))} total={data.data?.total ?? 0} onChange={value => update('page', String(value))} />
      </>}
    </section>
  );
}
