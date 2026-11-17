import { internalPageSize } from '../../utils/internal-pagination';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { PageHeader, LoadState, Empty, Pagination } from '../../components/manager/PortalUi';
import type { Page } from '../../components/manager/portal-data';
import { useApiResource } from '../../services/useApiResource';
import type { StoredItem } from '../../types/stock';

export function OperationalStoredItemsPage({ role }: { role: 'STAFF' | 'MANAGER' }) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const limit = internalPageSize(params);
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
  return (
    <section>
      <PageHeader title="Hàng đang lưu theo kho" description="Vị trí hiện tại theo hợp đồng, cập nhật khi hoàn tất chuyển kho. Phiếu lịch sử có vị trí riêng tại lúc hoàn tất.">
        <Link className="button-secondary" to={role === 'STAFF' ? '/staff/stock-movements' : '/manager/operations/stock-movements'}>Phiếu nhập – xuất</Link>
        <button className="button-secondary" onClick={data.refresh}>Làm mới</button>
      </PageHeader>
      <div className="portal-toolbar">
        <label className="field-label">Tìm mã kho, tên hàng hoặc khách hàng<input type="search" maxLength={100} value={params.get('search') ?? ''} onChange={event => update('search', event.target.value)} /></label>
        {params.get('storageUnitId') && <button className="button-secondary" onClick={() => update('storageUnitId', '')}>Bỏ lọc kho</button>}
      </div>
      <LoadState loading={data.loading} error={data.error} retry={data.refresh} />
      {!data.loading && !data.error && <>
        {!data.data?.items.length && <Empty title="Chưa có hàng tồn phù hợp" />}
        <div className="manager-table-wrap"><table className="manager-table">
          <thead><tr><th>Kho hiện tại</th><th>Khách thuê</th><th>Mặt hàng</th><th>Tồn</th><th>Lịch sử</th></tr></thead>
          <tbody>{data.data?.items.map(item => <tr key={item.id}>
            <td>{item.currentStorageUnit ? <><button className="portal-text-button" onClick={() => update('storageUnitId', item.currentStorageUnit!.id)}>{item.currentStorageUnit.unitNumber}</button><p>{[item.currentStorageUnit.floor, item.currentStorageUnit.zone].filter(Boolean).join(' · ')}</p></> : 'Chưa có vị trí'}</td>
            <td>{item.customer?.fullName}<p>{item.rentalContract?.contractCode}</p></td>
            <td>{item.name}<p>{item.itemCode}</p></td>
            <td>{item.balance} {item.unit}</td><td>{item.rentalContract?.id && <Link className="portal-text-button" to={`${role === 'MANAGER' ? '/manager/operations' : '/staff'}/stock-movements?rentalContractId=${encodeURIComponent(item.rentalContract.id)}`}>Phiếu và Staff kiểm đếm</Link>}</td>
          </tr>)}</tbody>
        </table></div>
        <Pagination page={page} limit={limit} onLimitChange={value => update('limit', String(value))} total={data.data?.total ?? 0} onChange={value => update('page', String(value))} />
      </>}
    </section>
  );
}
