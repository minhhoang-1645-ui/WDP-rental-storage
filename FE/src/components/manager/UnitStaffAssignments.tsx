import { useState } from 'react';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { usePaginatedResource } from '../../services/usePaginatedResource';
import { mutate } from '../../services/portal';
import { first, type Row } from './portal-data';
import { StaffPicker } from './StaffPicker';
import { LoadState } from './PortalUi';

type Assignment = { id: string; storageUnitId: string; staff: { id: string; fullName: string; accountStatus: string }; assignedBy: { fullName: string }; assignedAt: string };
export function UnitStaffAssignments() {
  const { user } = useAuth();
  const assignments = useApiResource<{ enabled: boolean; items: Assignment[] }>('/manager/unit-staff-assignments', user?.id ?? '');
  return <section className="manager-section"><h2>Nhân viên phụ trách từng kho</h2>
    <LoadState loading={assignments.loading} error={assignments.error} retry={assignments.refresh} />
    {assignments.data?.enabled === false && <p>Phân công cố định theo kho chưa được bật. Hiện quản lý vẫn có thể giao từng hồ sơ bên dưới.</p>}
    {assignments.data?.enabled && <Editor assignments={assignments.data.items} refresh={assignments.refresh} />}
  </section>;
}
function Editor({ assignments, refresh }: { assignments: Assignment[]; refresh: () => void }) {
  const { user } = useAuth();
  const units = usePaginatedResource<Row>('/manager/units?limit=100', user?.id ?? '', true);
  const [unitId, setUnitId] = useState(''), [staffId, setStaffId] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const current = assignments.find(item => item.storageUnitId === unitId);
  const save = async () => {
    if (busy || !unitId || !staffId) return;
    setBusy(true); setNotice('');
    try { await mutate(`/manager/units/${encodeURIComponent(unitId)}/staff-assignment`, 'PATCH', { staffUserId: staffId, expectedAssignmentId: current?.id ?? null }); setNotice('Đã lưu nhân viên phụ trách kho. Các phiếu chưa có người phù hợp sẽ được giao theo phân công này.'); refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Không lưu được phân công.'); }
    finally { setBusy(false); }
  };
  return <><p>Mỗi kho có một người phụ trách. Khi đổi người, lịch sử phân công được giữ; công việc đã bắt đầu vẫn giữ nhân viên đang thực hiện.</p>
    <LoadState loading={units.loading} error={units.error} retry={units.refresh} />
    <label className="field-label">Chọn kho cần phân công<select value={unitId} disabled={busy} onChange={event => { setUnitId(event.target.value); setStaffId(''); setNotice(''); }}><option value="">Chọn kho</option>{units.data?.items.map(unit => <option key={first(unit, 'id')} value={first(unit, 'id')}>{first(unit, 'unitCode')} · {first(unit, 'storageType.name')} · {first(unit, 'floor')} {first(unit, 'zone')}</option>)}</select></label>
    {current && <p>Đang phụ trách: {current.staff.fullName}{current.staff.accountStatus !== 'ACTIVE' ? ' · Tài khoản đã vô hiệu hóa, cần đổi người' : ''}. Người phân công: {current.assignedBy.fullName}.</p>}
    <StaffPicker value={staffId} onChange={setStaffId} disabled={busy || !unitId} currentStaff={current?.staff} />
    <button type="button" className="button-primary" disabled={busy || !unitId || !staffId} onClick={() => void save()}>{busy ? 'Đang lưu…' : 'Lưu người phụ trách kho'}</button>
    {notice && <p role="status">{notice}</p>}
    <div className="manager-table-wrap"><table className="manager-table"><thead><tr><th>Kho</th><th>Nhân viên</th><th>Người phân công</th></tr></thead><tbody>{assignments.map(item => <tr key={item.id}><td>{first(item as unknown as Row, 'storageUnit.unitNumber')}</td><td>{item.staff.fullName}</td><td>{item.assignedBy.fullName}</td></tr>)}</tbody></table></div>
  </>;
}
