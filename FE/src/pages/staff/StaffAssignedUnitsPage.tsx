import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { first, type Row } from '../../components/manager/portal-data';
import { LoadState, PageHeader } from '../../components/manager/PortalUi';

export function StaffAssignedUnitsPage() {
  const { user } = useAuth();
  const source = useApiResource<{ enabled: boolean; items: Row[] }>('/staff/assigned-units', user?.id ?? '');
  return <section className="workspace-home">
    <PageHeader title="Kho tôi phụ trách" description="Người phụ trách từng kho do quản lý phân công." />
    <LoadState loading={source.loading} error={source.error} retry={source.refresh} />
    {source.data?.enabled === false ? <p>Phân công cố định theo kho chưa được bật. Bạn vẫn xem và xử lý công việc đã được giao tại bàn làm việc.</p> : source.data?.enabled && <div className="manager-table-wrap"><table className="manager-table"><thead><tr><th>Kho</th><th>Vị trí</th><th>Người phân công</th></tr></thead><tbody>{source.data.items.map(item => <tr key={first(item, 'id')}><td>{first(item, 'storageUnit.unitNumber')}</td><td>{[first(item, 'storageUnit.floor'), first(item, 'storageUnit.zone')].filter(Boolean).join(' · ') || '—'}</td><td>{first(item, 'assignedBy.fullName')}</td></tr>)}</tbody></table>{!source.data.items.length && <p>Quản lý chưa giao kho nào cho bạn.</p>}</div>}
    <Link className="button-secondary" to="/staff">Về bàn làm việc</Link>
  </section>;
}
