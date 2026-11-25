import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../../services/api';
import { safeSessionStorage } from '../../services/browser-storage';
import { StaffPicker } from './StaffPicker';
import { useAuth } from '../../auth/auth-context';

type Unit = { id: string; code: string; facility: { id: string; name: string; closureMode?: string }; type: string; location: string };
type Contract = { id: string; code: string; customer: string; endDate: string; unit: Unit };
type Affected = Contract & { task: { id: string; status: string; assignedStaffUserId: string } | null };
type PendingBooking = { id: string; reservationCode: string; customer: string; facility: Unit['facility']; status: string; signed: boolean; paid: boolean; handoverRecorded: boolean; refund: { refundAmount: string } | null };
type Task = { id: string; status: string; contract: Contract; transfer: { id: string; status: string } | null };
type RecordView = { id: string; code: string; status: string; contract: Contract; source: Unit; destination: Unit; consent: boolean; assignedStaffId: string; receivingStaffId: string | null; safetyConfirmed: boolean; servicesApproved: boolean; sourceHandover: boolean; destinationHandover: boolean; exception: string | null };

function unitLabel(unit: Unit) { return unit.facility.name + ' · ' + unit.code; }
const pending = (status: string) => ['REQUESTED', 'APPROVED'].includes(status);
const statusName = (status: string) => ({ REQUESTED: 'Chờ khách xác nhận', APPROVED: 'Đã giữ kho', COMPLETED: 'Đã chuyển kho', REJECTED: 'Đã hủy hoặc từ chối', ASSIGNED: 'Đã phân công', ESCALATED: 'Chờ quản lý xử lý', IN_PROGRESS: 'Đang hỗ trợ', RESOLVED: 'Đã xử lý' }[status] ?? status);

export function ClosureRelocations({ revision }: { revision: number }) {
  const { user } = useAuth();
  const manager = user?.role === 'FACILITY_MANAGER';
  const scope = manager ? safeSessionStorage.getItem('nestbox-manager-facility') : null;
  const [affected, setAffected] = useState<Affected[]>([]);
  const [pendingBookings, setPendingBookings] = useState<PendingBooking[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [records, setRecords] = useState<RecordView[]>([]);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState('');
  const [staff, setStaff] = useState('');
  const [note, setNote] = useState('');
  const [units, setUnits] = useState<Unit[]>([]);
  const [destination, setDestination] = useState('');
  const [servicesConfirmed, setServicesConfirmed] = useState(false);
  const [customerAgreed, setCustomerAgreed] = useState(false);
  const [refundConfirmed, setRefundConfirmed] = useState(false);
  const [returnSafety, setReturnSafety] = useState('');
  const path = (suffix = '') => '/relocations' + suffix + (scope ? '?scopeFacilityId=' + encodeURIComponent(scope) : '');
  useEffect(() => {
    const controller = new AbortController();
    const base = '/relocations';
    const query = scope ? '?scopeFacilityId=' + encodeURIComponent(scope) : '';
    Promise.all([
      apiRequest<RecordView[]>(base + query, { signal: controller.signal }),
      manager ? apiRequest<Affected[]>(base + '/affected' + query, { signal: controller.signal }) : apiRequest<Task[]>(base + '/tasks', { signal: controller.signal }),
      manager ? apiRequest<PendingBooking[]>(base + '/pending-bookings' + query, { signal:controller.signal }) : Promise.resolve([]),
    ]).then(([nextRecords, nextTasks, nextBookings]) => {
      if (controller.signal.aborted) return;
      setRecords(nextRecords);
      setPendingBookings(nextBookings);
      setError('');
      if (manager) setAffected(nextTasks as Affected[]); else setTasks(nextTasks as Task[]);
    }).catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [manager, scope, revision, reload]);
  function choose(id: string) { setSelected(id); setStaff(''); setNote(''); setUnits([]); setDestination(''); setError(''); setServicesConfirmed(false); setCustomerAgreed(false); setRefundConfirmed(false); setReturnSafety(''); }
  async function action(suffix: string, body: object, successNotice = '') {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await apiRequest(path(suffix), { method: 'POST', body: JSON.stringify(body) }); choose(''); setNotice(successNotice); setReload(n => n + 1); }
    catch (err) { setError(err instanceof Error ? err.message : 'Không thể xử lý hồ sơ.'); }
    finally { setBusy(false); }
  }
  async function loadDestinations(id: string) {
    setBusy(true); setError('');
    try { setUnits(await apiRequest<Unit[]>(path('/tasks/' + id + '/destinations'))); }
    catch (err) { setError(err instanceof Error ? err.message : 'Không thể tìm kho.'); }
    finally { setBusy(false); }
  }
  const noteField = (label: string) => <label className="field-label">{label}<textarea value={note} maxLength={2000} onChange={event => setNote(event.target.value)} /></label>;
  return <details className="manager-section" open={!!notice || affected.length + pendingBookings.length + tasks.length + records.filter(row => pending(row.status)).length > 0}>
    <summary><strong>Hỗ trợ di dời liên cơ sở</strong></summary>
    {error && <p role="alert" className="portal-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!affected.length && !pendingBookings.length && !tasks.length && !records.length && <p>Chưa có hồ sơ hỗ trợ di dời.</p>}
    {manager && [...new Map([...affected.map(item=>item.unit.facility),...pendingBookings.map(item=>item.facility)].map(facility=>[facility.id,facility])).values()].map(facility=><button className="button-secondary" key={facility.id} disabled={busy} onClick={()=>void action('/facilities/'+facility.id+'/notify',{})}>Thông báo hỗ trợ cho khách · {facility.name}</button>)}
    {pendingBookings.map(item=><div className="manager-section" key={item.id}>
      <h3>{item.customer} · {item.reservationCode}</h3>
      <p>{item.facility.name} · {item.refund?'Đã hủy, chờ hoàn tiền':item.status==='PENDING'?'Chưa xác nhận đặt kho':'Chưa kích hoạt thuê'} · {item.paid?'Đã ghi nhận thanh toán':'Chưa thanh toán'} · {item.signed?'Đã ký hợp đồng':'Chưa ký hợp đồng'}</p>
      {item.refund ? <p>Cần hoàn {BigInt(item.refund.refundAmount).toLocaleString('vi-VN')} ₫</p> :
        <p>{item.handoverRecorded?'Đã có ghi nhận bàn giao. Cần đối chiếu quyền truy cập thực tế.':item.facility.closureMode==='REQUIRED_RELOCATION'?'Đã dừng bàn giao thông thường. Quản lý cần thống nhất phương án với khách.':'Xử lý cam kết đặt kho hiện có theo hồ sơ.'}</p>}
      <Link className="button-secondary" to={'/manager/reservations/'+encodeURIComponent(item.id)}>Xem hồ sơ đặt kho</Link>
      {(item.refund || item.status==='CONFIRMED' && !item.handoverRecorded) && <button className="button-secondary" onClick={()=>choose(item.id)}>{item.refund?'Ghi nhận hoàn tiền':'Xử lý hủy theo thỏa thuận'}</button>}
      {selected===item.id && <div className="portal-form">
        {noteField(item.refund?'Ghi chú đối soát khoản đã hoàn':'Căn cứ thỏa thuận hủy với khách')}
        {item.refund ? <>
          <label><input type="checkbox" checked={refundConfirmed} onChange={event=>setRefundConfirmed(event.target.checked)} /> Đã hoàn đúng số tiền cho khách</label>
          <button className="button-primary" disabled={busy || !refundConfirmed || note.trim().length<3} onClick={()=>void action('/bookings/'+item.id+'/resolve',{action:'CONFIRM_REFUND',refunded:true,refundAmount:item.refund!.refundAmount,note},'Đã ghi nhận hoàn tiền.')}>Xác nhận đã hoàn tiền</button>
        </> : <>
          <label><input type="checkbox" checked={customerAgreed} onChange={event=>setCustomerAgreed(event.target.checked)} /> Khách đã đồng ý hủy đơn và nhận lại khoản đã thu (nếu có)</label>
          <button className="button-primary" disabled={busy || !customerAgreed || note.trim().length<3} onClick={()=>void action('/bookings/'+item.id+'/resolve',{action:'CANCEL',customerAgreed,note},'Đã hủy đơn theo thỏa thuận.')}>Hủy đơn theo thỏa thuận</button>
        </>}
      </div>}
    </div>)}
    {affected.map(item => <div key={item.id} className="manager-section">
      <h3>{item.customer} · {item.code}</h3>
      <p>{unitLabel(item.unit)} · {item.task ? statusName(item.task.status) : 'Chưa phân công'}</p>
      {item.task?.status !== 'RESOLVED' && <button className="button-secondary" onClick={() => choose(item.id)}>Phân công hỗ trợ</button>}
      {selected === item.id && <div className="portal-form"><StaffPicker value={staff} onChange={setStaff} disabled={busy}/><button className="button-primary" disabled={!staff || busy} onClick={() => void action('/contracts/' + item.id + '/assign', { staffUserId: staff })}>Giao việc</button></div>}
      {item.task?.status === 'ESCALATED' && selected === item.id && <div className="portal-form">
        {noteField('Căn cứ xử lý ngoại lệ')}
        <button className="button-secondary" disabled={busy || note.trim().length < 3} onClick={() => void action('/tasks/' + item.task!.id + '/resolve-exception', { action: 'RETRY', note })}>Tiếp tục hỗ trợ</button>
        <label><input type="checkbox" checked={customerAgreed} onChange={e => setCustomerAgreed(e.target.checked)} /> Khách đã đồng ý phương án trả trước hạn</label>
        {item.unit.facility.closureMode === 'REQUIRED_RELOCATION' && <label className="field-label">Căn cứ an toàn thu hồi kho<textarea value={returnSafety} onChange={e => setReturnSafety(e.target.value)} /></label>}
        <button className="button-secondary" disabled={busy || !customerAgreed || note.trim().length < 3 || item.unit.facility.closureMode === 'REQUIRED_RELOCATION' && returnSafety.trim().length < 3} onClick={() => void action('/tasks/' + item.task!.id + '/resolve-exception', { action: 'TERMINATION', note, customerAgreed, safetyEvidence: returnSafety })}>Chuyển đến đề nghị trả trước hạn</button>
      </div>}
    </div>)}
    {tasks.map(task => <div key={task.id} className="manager-section">
      <h3>{task.contract.customer} · {task.contract.code}</h3><p>{unitLabel(task.contract.unit)} · {statusName(task.status)}</p>
      {!task.transfer || !pending(task.transfer.status) ? <button className="button-secondary" onClick={() => { choose(task.id); void loadDestinations(task.id); }}>Tìm kho thay thế</button> : <button className="button-secondary" onClick={() => choose(task.id)}>Báo vướng mắc</button>}
      {selected === task.id && <div className="portal-form">
        {(!task.transfer || !pending(task.transfer.status)) && <><label className="field-label">Kho thay thế<select value={destination} onChange={e => setDestination(e.target.value)}><option value="">Chọn kho phù hợp</option>{units.map(unit => <option value={unit.id} key={unit.id}>{unitLabel(unit)} · {unit.type}</option>)}</select></label>
          {!busy && !units.length && <p>Chưa tìm thấy kho phù hợp.</p>}<button className="button-primary" disabled={!destination || busy} onClick={() => void action('/tasks/' + task.id + '/propose', { destinationId: destination })}>Tạo phương án cho khách</button></>}
        {noteField('Vướng mắc hoặc nhu cầu xử lý khác')}<button className="button-secondary" disabled={note.trim().length < 3 || busy} onClick={() => void action('/tasks/' + task.id + '/exception', { note })}>Báo quản lý</button>
      </div>}
    </div>)}
    {records.map(row => <div key={row.id} className="manager-section">
      <h3>{row.contract.customer} · {row.code}</h3>
      <p>{unitLabel(row.source)} → {unitLabel(row.destination)} · {statusName(row.status)}</p>
      <p>Khách {row.consent ? 'đã đồng ý' : 'chưa đồng ý'} · Kho cũ {row.sourceHandover ? 'đã giao' : 'chờ giao'} · Kho mới {row.destinationHandover ? 'đã nhận' : 'chờ nhận'}</p>
      {row.exception && <p role="alert">{row.exception}</p>}
      {pending(row.status) && <button className="button-secondary" onClick={() => choose(row.id)}>Xử lý hồ sơ</button>}
      {selected === row.id && <div className="portal-form">
        {manager ? <>
          {row.status === 'APPROVED' && (!scope || row.destination.facility.id === scope) && <><StaffPicker value={staff} onChange={setStaff}/><button className="button-primary" disabled={!staff || busy || row.destinationHandover} onClick={() => void action('/' + row.id + '/receiving-staff', { staffUserId: staff })}>Phân công tiếp nhận</button>
          {!row.sourceHandover && <>{noteField('Căn cứ phối hợp dịch vụ, thiết bị và sự đồng ý của khách')}<button className="button-secondary" disabled={busy || note.trim().length < 3} onClick={() => void action('/' + row.id + '/services', { evidence: note })}>{row.servicesApproved ? 'Đối chiếu lại dịch vụ' : 'Xác nhận phương án dịch vụ'}</button></>}</>}
          {(!scope || row.source.facility.id === scope) && <>{noteField('Căn cứ an toàn hoặc lý do hủy')}
            {row.status === 'APPROVED' && <button className="button-secondary" disabled={busy || note.trim().length < 3 || row.sourceHandover} onClick={() => void action('/' + row.id + '/safety', { evidence: note })}>Xác nhận an toàn di dời</button>}
            <button className="button-secondary" disabled={busy || note.trim().length < 3 || row.sourceHandover} onClick={() => void action('/' + row.id + '/cancel', { note })}>Hủy phương án</button></>}
        </> : <>
          {noteField(row.status === 'REQUESTED' ? 'Căn cứ xác nhận của khách về kho đích' : 'Ghi nhận bàn giao và quyền truy cập')}
          {row.status === 'REQUESTED' && row.assignedStaffId === user?.id && <>
            <button className="button-primary" disabled={busy || note.trim().length < 3} onClick={() => void action('/' + row.id + '/consent', { agreed: true, evidence: note, destinationId: row.destination.id })}>Ghi nhận khách đồng ý và giữ kho</button>
            <button className="button-secondary" disabled={busy || note.trim().length < 3} onClick={() => void action('/' + row.id + '/consent', { agreed: false, evidence: note, destinationId: row.destination.id })}>Ghi nhận khách từ chối</button></>}
          {row.status === 'APPROVED' && !row.exception && <>
            {row.servicesApproved && <label><input type="checkbox" checked={servicesConfirmed} onChange={e => setServicesConfirmed(e.target.checked)} /> Đã xử lý thiết bị và sản phẩm theo phương án được xác nhận</label>}
            {row.assignedStaffId === user?.id && !row.sourceHandover && <>{!row.receivingStaffId && <p>Chờ cơ sở đích phân công người tiếp nhận.</p>}<button className="button-primary" disabled={busy || !row.receivingStaffId || note.trim().length < 3 || row.source.facility.closureMode === 'REQUIRED_RELOCATION' && !row.safetyConfirmed || row.servicesApproved && !servicesConfirmed} onClick={() => void action('/' + row.id + '/handover', { side: 'source', confirmed: true, note, servicesConfirmed })}>Xác nhận kho cũ đã trống và thu quyền truy cập</button></>}
            {row.receivingStaffId === user?.id && !row.destinationHandover && <button className="button-primary" disabled={busy || !row.sourceHandover || note.trim().length < 3 || row.servicesApproved && !servicesConfirmed} onClick={() => void action('/' + row.id + '/handover', { side: 'destination', confirmed: true, note, servicesConfirmed })}>Xác nhận tiếp nhận và cấp quyền kho mới</button>}
          </>}
          {pending(row.status) && (row.assignedStaffId===user?.id || row.receivingStaffId===user?.id) && <button className="button-secondary" disabled={busy || note.trim().length<3} onClick={()=>void action('/'+row.id+'/report-exception',{side:row.receivingStaffId===user?.id?'destination':'source',note})}>Báo vướng mắc cho quản lý</button>}
        </>}
      </div>}
    </div>)}
  </details>;
}
