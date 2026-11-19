import { useState } from 'react';
import { StoredItemDetail } from '../../components/stock/StoredItemDetail';
import { RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { ManagerTaskTable, ManagerTableSearch } from '../../components/manager/ManagerTaskTable';
import { useManagerTableParams } from '../../components/manager/manager-table-params';
import { PageHeader } from '../../components/manager/PortalUi';
import type { Page } from '../../components/manager/portal-data';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { StaffRowActions, type StaffColumn } from '../../components/workspace/StaffTaskTable';
import { useApiResource } from '../../services/useApiResource';
import type { StoredItem } from '../../types/stock';

const title = 'Hàng đang lưu theo kho';
const movements = '/manager/operations/stock-movements';

export function ManagerStoredItemsPage() {
  const [selected, setSelected] = useState<StoredItem | null>(null);
  const { user } = useAuth();
  const { params, page, limit, update } = useManagerTableParams();
  const search = params.get('search') ?? '';
  const unit = params.get('storageUnitId');
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search.trim()) query.set('search', search.trim().slice(0, 100));
  if (unit) query.set('storageUnitId', unit);
  const data = useApiResource<Page<StoredItem>>('/manager/stored-items?' + query, user?.id, true);
  const columns: StaffColumn<StoredItem>[] = [
    { key: 'item', label: 'Tên hàng', cell: item => <><strong>{item.name}</strong><CopyRecordCode value={item.itemCode} label="Mã hàng" /></> },
    { key: 'unit', label: 'Kho hiện tại', cell: ({ currentStorageUnit: storage }) => storage ? <>
      <button type="button" className="portal-text-button" onClick={() => update('storageUnitId', storage.id)}>{storage.unitNumber}</button>
      <small>{[storage.floor, storage.zone].filter(Boolean).join(' · ')}</small>
    </> : '—' },
    { key: 'customer', label: 'Khách hàng', cell: item => item.customer?.fullName || '—' },
    { key: 'contract', label: 'Hợp đồng', optional: true, cell: item => item.rentalContract?.contractCode || '—' },
    { key: 'balance', label: 'Số lượng tồn', cell: item => <strong>{item.balance.toLocaleString('vi-VN')} {item.unit}</strong> },
    { key: 'actions', label: 'Thao tác', cell: item => item.rentalContract?.id
      ? <StaffRowActions code={item.itemCode} to={movements + '?rentalContractId=' + encodeURIComponent(item.rentalContract.id)} detailLabel="Xem phiếu nhập – xuất" />
      : '—' },
  ];
  return <section>
    <PageHeader title={title}>
      <Link className="button-secondary" to={movements}>Phiếu nhập – xuất</Link>
      <button className="button-secondary" type="button" onClick={data.refresh}><RefreshCw size={16} /> Làm mới</button>
    </PageHeader>
    <ManagerTaskTable title={title} columns={columns} items={data.data?.items ?? []} rowKey={item => item.id} rowDetail={item => ({ open: () => setSelected(item), label: `Xem mặt hàng ${item.name} · ${item.itemCode}` })}
      loading={data.loading} refreshing={data.refreshing} error={data.error} retry={data.refresh} page={page} limit={limit} total={data.data?.total ?? 0} update={update}
      toolbar={<>
        <ManagerTableSearch value={search} onChange={value => update('search', value)} placeholder="Mã kho, tên hàng hoặc khách hàng…" />
        {unit && <button className="button-secondary" type="button" onClick={() => update('storageUnitId', '')}>Bỏ lọc kho</button>}
      </>} emptyTitle="Chưa có hàng tồn phù hợp" />
    {selected && <StoredItemDetail item={selected} movements={movements} onClose={() => setSelected(null)} />}
  </section>;
}
