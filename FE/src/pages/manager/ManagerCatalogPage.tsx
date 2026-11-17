import { RefreshCw } from "lucide-react";
import { useState } from 'react';
import { InventoryEditor } from './InventoryEditor';
import { useAuth } from "../../auth/auth-context";
import { useApiResource } from "../../services/useApiResource";
import { ManagerAvailabilityForm } from "./ManagerAvailabilityForm";
import { Link } from 'react-router-dom';
import { operationPath } from '../../auth/portal-routing';
import { managerStorageLabels } from '../../utils/manager-sections';
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
  Status,
} from "../../components/manager/PortalUi";
export function ManagerCatalogPage() {
  const { user } = useAuth();
  const resource = useApiResource<Row>("/booking/catalog", user?.id ?? "");
  const managed = useApiResource<Row>(user?.role === 'MANAGER' ? '/manager/storage-types' : null, user?.id ?? '');
  const [editor, setEditor] = useState<{ record?: Row }>();
  const refresh = () => { resource.refresh(); managed.refresh(); };
  const products = rows(resource.data?.products);
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
        {user?.role === 'MANAGER' && <button className="button-primary" onClick={() => setEditor({})}>Thêm loại kho</button>}
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
      {user?.role === 'MANAGER' && <LoadState loading={managed.loading} error={managed.error} retry={managed.refresh} />}
      {editor && <InventoryEditor kind="type" record={editor.record} onClose={() => setEditor(undefined)} onSaved={() => { setEditor(undefined); refresh(); }} />}
      {resource.data && (
        <>
          {products.length > 0 && (
            <details className="catalog-availability"><summary>Kiểm tra kho trống</summary><ManagerAvailabilityForm key={user?.id} products={products} /></details>
          )}
          <div className="booking-alert">
            Giá mới chỉ áp dụng cho báo giá mới. Hợp đồng và hóa đơn đã lập giữ nguyên dữ liệu.
          </div>
          {products.length ? (
            <div className="manager-table-wrap catalog-table-wrap"><table className="manager-table catalog-table" aria-label="Loại kho và đơn giá">
              <thead><tr><th>Loại kho</th><th>Kích thước</th><th>Giá thuê / tháng</th><th>Điều kiện thuê</th><th>Trạng thái</th>{user?.role === 'MANAGER' && <th>Thao tác</th>}</tr></thead>
              <tbody>{products.map(row => <tr key={first(row, 'id')}>
                <td><strong>{first(row, 'name')}</strong><small>{first(row, 'code')} · {label(row.condition)}</small><small>{categories.get(first(row, 'sizeId')) || 'Chưa phân nhóm'}</small></td>
                <td>{first(row, 'dimensions')}<small>{[first(row, 'floorArea'), first(row, 'volume')].filter(Boolean).join(' / ')}</small></td>
                <td><strong>{money(row.monthlyPrice)}</strong></td>
                <td><span>Cọc: {row.depositMonths == null ? 'Chưa thiết lập' : `${first(row, 'depositMonths')} tháng`}</span><small>Thuê tối thiểu: {row.minRentalDays == null ? 'Chưa thiết lập' : `${first(row, 'minRentalDays')} ngày`}</small><small>Theo ngày: {row.allowDailyRental == null ? 'Chưa thiết lập' : row.allowDailyRental ? 'Có' : 'Không'}</small></td>
                <td><Status value={first(row, 'status').toUpperCase()} /></td>
                {user?.role === 'MANAGER' && <td><div className="manager-inline-actions"><button className="button-secondary" disabled={!rows(managed.data?.items).some(item => item.id === row.id)} onClick={() => setEditor({ record: rows(managed.data?.items).find(item => item.id === row.id) })}>Chỉnh sửa</button></div></td>}
              </tr>)}</tbody>
            </table></div>
          ) : (
            <Empty />
          )}
        </>
      )}
    </section>
  );
}
