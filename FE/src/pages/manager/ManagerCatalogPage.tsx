import { useListPagination } from '../../components/workspace/useListPagination';
import { RefreshCw } from "lucide-react";
import { useState } from 'react';
import { InventoryEditor } from './InventoryEditor';
import { useAuth } from "../../auth/auth-context";
import { useApiResource } from "../../services/useApiResource";
import { ManagerAvailabilityForm } from "./ManagerAvailabilityForm";
import { Link } from 'react-router-dom';
import { operationPath } from '../../auth/portal-routing';
import { managerStorageLabels } from '../../utils/manager-sections';
import { DetailRow } from '../../components/workspace/DetailRow';
import {
  first,
  label,
  money,
  rows,
  type Row,
} from "../../components/manager/portal-data";
import {
  Empty,
  LoadState,
  PageHeader,
  RecordFactsDialog,
  Status,
} from "../../components/manager/PortalUi";
export function ManagerCatalogPage() {
  const { user } = useAuth();
  const resource = useApiResource<Row>("/booking/catalog", user?.id ?? "");
  const managed = useApiResource<Row>(user?.role === 'FACILITY_MANAGER' ? '/manager/storage-types' : null, user?.id ?? '');
  const [editor, setEditor] = useState<{ record?: Row }>();
  const [selected, setSelected] = useState<Row>();
  const refresh = () => { resource.refresh(); managed.refresh(); };
  const publicProducts = rows(resource.data?.products);
  const products: Row[] = user?.role === 'FACILITY_MANAGER' ? rows(managed.data?.items).map(row => publicProducts.find(product => product.id === row.id) ?? {
    ...row, monthlyPrice: row.monthlyRate, dimensions: [row.widthCm, row.lengthCm, row.heightCm].join(' × ') + ' cm', status: 'UNAVAILABLE',
  }) : publicProducts;
  const { items: visibleProducts, pagination } = useListPagination(products);
  const categories = new Map(
    rows(resource.data?.sizes).map((row) => [
      first(row, "id"),
      first(row, "name"),
    ]),
  );
  return (
    <section>
      <PageHeader
        title={managerStorageLabels.catalog.title}
        description={managerStorageLabels.catalog.description}
      >
        {user?.role === 'FACILITY_MANAGER' && <button className="button-primary" onClick={() => setEditor({})}>Thêm loại kho</button>}
        <Link className="button-secondary" to={operationPath(user?.role, '/manager/catalog/additional-services')}>Dịch vụ bổ sung</Link>
        <button
          className="button-secondary"
          onClick={refresh}
          disabled={resource.loading}
        >
          <RefreshCw size={16} />
          Làm mới
        </button>
      </PageHeader>
      <LoadState
        loading={resource.loading}
        error={resource.error}
        retry={resource.refresh}
      />
      {user?.role === 'FACILITY_MANAGER' && <LoadState loading={managed.loading} error={managed.error} retry={managed.refresh} />}
      {editor && <InventoryEditor kind="type" record={editor.record} onClose={() => setEditor(undefined)} onSaved={() => { setEditor(undefined); refresh(); }} />}
      {(resource.data || managed.data) && (
        <>
          {products.some(row => row.status !== 'UNAVAILABLE') && (
            <details className="catalog-availability"><summary>Kiểm tra kho trống</summary><ManagerAvailabilityForm key={user?.id} products={products.filter(row => row.status !== 'UNAVAILABLE')} /></details>
          )}
          <div className="booking-alert">
            Giá mới chỉ áp dụng cho báo giá mới. Hợp đồng và hóa đơn đã lập giữ nguyên dữ liệu.
          </div>
          {products.length ? (
            <div className="manager-table-wrap catalog-table-wrap"><table className="manager-table catalog-table" aria-label="Loại kho và đơn giá">
              <thead><tr><th>Loại kho</th><th>Kích thước</th><th>Giá thuê / tháng</th><th>Điều kiện thuê</th><th>Trạng thái</th>{user?.role === 'FACILITY_MANAGER' && <th>Thao tác</th>}</tr></thead>
              <tbody>{visibleProducts.map(row => <DetailRow key={first(row, 'id')} detail={{ open: () => setSelected(row), label: `Xem loại kho ${first(row, 'name')}` }}>
                <td><strong>{first(row, 'name')}</strong><small>{first(row, 'code')} · {label(row.condition)}</small><small>{categories.get(first(row, 'sizeId')) || 'Chưa phân nhóm'}</small></td>
                <td>{first(row, 'dimensions')}<small>{[first(row, 'floorArea'), first(row, 'volume')].filter(Boolean).join(' / ')}</small></td>
                <td><strong>{money(row.monthlyPrice)}</strong></td>
                <td><span>Cọc: {row.depositMonths == null ? 'Chưa thiết lập' : `${first(row, 'depositMonths')} tháng`}</span><small>Thuê tối thiểu: {row.minRentalDays == null ? 'Chưa thiết lập' : `${first(row, 'minRentalDays')} ngày`}</small><small>Theo ngày: {row.allowDailyRental == null ? 'Chưa thiết lập' : row.allowDailyRental ? 'Có' : 'Không'}</small></td>
                <td><Status value={first(row, 'status').toUpperCase()} /></td>
                {user?.role === 'FACILITY_MANAGER' && <td><div className="manager-inline-actions"><button className="button-secondary" disabled={!rows(managed.data?.items).some(item => item.id === row.id)} onClick={() => setEditor({ record: rows(managed.data?.items).find(item => item.id === row.id) })}>Chỉnh sửa</button></div></td>}
              </DetailRow>)}</tbody>
            </table></div>
          ) : (
            <Empty />
          )}
          {pagination}
        </>
      )}
      {selected && <RecordFactsDialog title={first(selected, 'name')} onClose={() => setSelected(undefined)} items={[
        ['Mã loại kho', first(selected, 'code')],
        ['Nhóm kích thước', categories.get(first(selected, 'sizeId'))],
        ['Điều kiện bảo quản', label(selected.condition)],
        ['Kích thước', first(selected, 'dimensions')],
        ['Diện tích', first(selected, 'floorArea') || undefined],
        ['Thể tích', first(selected, 'volume') || undefined],
        ['Giá thuê / tháng', money(selected.monthlyPrice)],
        ['Tiền cọc', selected.depositMonths == null ? 'Chưa thiết lập' : `${first(selected, 'depositMonths')} tháng`],
        ['Thuê tối thiểu', selected.minRentalDays == null ? 'Chưa thiết lập' : `${first(selected, 'minRentalDays')} ngày`],
        ['Cho thuê theo ngày', selected.allowDailyRental == null ? 'Chưa thiết lập' : selected.allowDailyRental ? 'Có' : 'Không'],
        ['Trạng thái', label(selected.status)],
      ]} />}
    </section>
  );
}
