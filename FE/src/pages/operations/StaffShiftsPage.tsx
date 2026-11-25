import { useOutletContext } from 'react-router-dom';
import { useEffect, useState, type FormEvent } from 'react';
import { apiRequest } from '../../services/api';
import '../../styles/staff-shifts.css';

type Option = { id: string; name: string };
type Shift = {
  id: string;
  facilityId: string;
  staffUserId: string;
  facility: Option;
  staff: { id: string; fullName: string };
  startsAt: string;
  endsAt: string;
  status: string;
  attendance: string;
  checkedInAt?: string;
  checkedOutAt?: string;
  reason?: string;
  revision: number;
};
type Response = { serverTime: string; items: Shift[] };
type Affected = { id: string; code: string; type: string };
type Draft = { staffUserId: string; startsAt: string; endsAt: string; id?: string; revision?: number };
const timeZone = 'Asia/Ho_Chi_Minh';
const localDate = (date: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone }).format(date);
const localInput = (value: string) => new Intl.DateTimeFormat('sv-SE', {
  timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(new Date(value)).replace(' ', 'T');
const formatTime = (value: string) => new Intl.DateTimeFormat('vi-VN', { timeZone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Không thể tải thông tin ca làm.';
const attendanceLabel: Record<string, string> = {
  NOT_CHECKED_IN: 'Chưa vào ca', PRESENT: 'Đang trong ca', CHECKED_OUT: 'Đã kết thúc',
  ENDED: 'Đã hết giờ', CANCELLED: 'Đã hủy', ON_LEAVE: 'Nghỉ', ABSENT: 'Vắng mặt',
};
const affectedLabel: Record<string, string> = {
  appointments: 'Bàn giao', transfers: 'Chuyển kho', returns: 'Trả kho', 'support-requests': 'Hỗ trợ',
  maintenance: 'Bảo trì', 'damage-claims': 'Khiếu nại',
};

export function StaffShiftsPage({ manager = false }: { manager?: boolean }) {
  const facilityId = useOutletContext<string | undefined>();
  const [staff, setStaff] = useState<{ id: string; fullName: string }[]>([]);
  const [date, setDate] = useState(() => localDate(new Date()));
  const [period, setPeriod] = useState(7);
  const [response, setResponse] = useState<Response>();
  const [draft, setDraft] = useState<Draft>();
  const [statusEdit, setStatusEdit] = useState<{ row: Shift; status: string; reason: string }>();
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rosterError, setRosterError] = useState('');
  const [formError, setFormError] = useState('');
  const [peopleError, setPeopleError] = useState('');
  const [notice, setNotice] = useState('');
  const [affected, setAffected] = useState<Affected[]>([]);

  useEffect(() => {
    if (!manager || !facilityId) return;
    setPeopleError('');
    const controller = new AbortController();
    setStaff([]);
    const fetchStaff = async () => {
      const staff: { id: string; fullName: string }[] = [];
      for (let page = 1; ; page++) {
        const result = await apiRequest<{ items: typeof staff; total: number }>(`/manager/staff?page=${page}`, { signal: controller.signal });
        staff.push(...result.items);
        if (staff.length >= result.total || !result.items.length) break;
      }
      setStaff(staff);
    };
    fetchStaff().catch(error => { if (!controller.signal.aborted) setPeopleError(errorText(error)); });
    return () => controller.abort();
  }, [manager, facilityId]);

  useEffect(() => {
    if (!date || manager && !facilityId) return;
    const controller = new AbortController();
    setLoading(true);
    setRosterError('');
    const start = new Date(date + 'T00:00:00+07:00');
    const end = new Date(start.getTime() + period * 86400000);
    const query = new URLSearchParams({ from: start.toISOString(), to: end.toISOString() });
    if (manager && facilityId) query.set('facilityId', facilityId);
    apiRequest<Response>(`/${manager ? 'manager' : 'staff'}/shifts?${query}`, { signal: controller.signal })
      .then(setResponse)
      .catch(error => { if (!controller.signal.aborted) setRosterError(errorText(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [date, period, facilityId, revision, manager]);

  async function save(path: string, method: string, body?: object) {
    if (busy) return;
    setBusy(true);
    setFormError('');
    setNotice('');
    setAffected([]);
    try {
      const result = await apiRequest<{ affected?: Affected[] }>(path, { method, body: body ? JSON.stringify(body) : undefined });
      setNotice('Đã cập nhật ca làm.');
      setAffected(result.affected ?? []);
      setDraft(undefined);
      setStatusEdit(undefined);
      setRevision(value => value + 1);
    } catch (error) {
      setFormError(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  function saveDraft(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    void save(draft.id ? `/manager/shifts/${draft.id}` : '/manager/shifts', draft.id ? 'PATCH' : 'POST', {
      facilityId, staffUserId: draft.staffUserId, startsAt: draft.startsAt + '+07:00', endsAt: draft.endsAt + '+07:00', revision: draft.revision,
    });
  }

  const serverTime = new Date(response?.serverTime ?? 0).getTime();
  return <main className="shifts-page">
    <h1>{manager ? 'Lịch ca làm' : 'Ca làm của tôi'}</h1>
    <div className="shifts-toolbar">
      <label>Từ ngày<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <label>Phạm vi<select value={period} onChange={event => setPeriod(Number(event.target.value))}><option value={1}>Một ngày</option><option value={7}>Một tuần</option></select></label>
      <button className="button-secondary" onClick={() => setRevision(value => value + 1)}>Làm mới</button>
      {manager && <button className="button-primary" disabled={!facilityId || !staff.length || busy}
        onClick={() => { setStatusEdit(undefined); setDraft({ staffUserId: '', startsAt: '', endsAt: '' }); }}>Xếp ca</button>}
    </div>
    {peopleError && <p role="alert">{peopleError}</p>}
    {notice && <p role="status">{notice}</p>}
    {formError && <p role="alert">{formError}</p>}
    {affected.length > 0 && <section className="shifts-warning">
      <strong>Nhiệm vụ cần kiểm tra lại</strong>
      <ul>{affected.map(item => <li key={item.id}>{affectedLabel[item.type] ?? item.type} · {item.code}</li>)}</ul>
    </section>}
    {draft && <form className="shifts-toolbar shifts-form" onSubmit={saveDraft}>
      <label>Nhân viên<select required value={draft.staffUserId} onChange={event => setDraft({ ...draft, staffUserId: event.target.value })}>
        <option value="">Chọn nhân viên</option>
        {staff.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}
      </select></label>
      <label>Bắt đầu<input required type="datetime-local" value={draft.startsAt} onChange={event => setDraft({ ...draft, startsAt: event.target.value })} /></label>
      <label>Kết thúc<input required type="datetime-local" value={draft.endsAt} onChange={event => setDraft({ ...draft, endsAt: event.target.value })} /></label>
      <button type="submit" className="button-primary" disabled={busy}>Lưu ca</button>
      <button type="button" className="button-secondary" onClick={() => setDraft(undefined)} disabled={busy}>Đóng</button>
    </form>}
    {statusEdit && <form className="shifts-toolbar shifts-form" onSubmit={event => {
      event.preventDefault();
      void save(`/manager/shifts/${statusEdit.row.id}/status`, 'PATCH', { status: statusEdit.status, reason: statusEdit.reason, revision: statusEdit.row.revision });
    }}>
      <label>Ghi nhận<select value={statusEdit.status} onChange={event => setStatusEdit({ ...statusEdit, status: event.target.value })}>
        <option value="ON_LEAVE">Nghỉ</option><option value="ABSENT">Vắng mặt</option><option value="CANCELLED">Hủy ca</option>
      </select></label>
      <label>Lý do<input required maxLength={500} value={statusEdit.reason} onChange={event => setStatusEdit({ ...statusEdit, reason: event.target.value })} /></label>
      <button type="submit" className="button-primary" disabled={busy}>Xác nhận</button>
      <button type="button" className="button-secondary" onClick={() => setStatusEdit(undefined)} disabled={busy}>Đóng</button>
    </form>}
    {!date ? <p>Chọn ngày để xem ca làm.</p> : manager && !facilityId ? null : loading ? <p role="status">Đang tải lịch ca làm…</p> : rosterError ? <p role="alert">{rosterError}</p>
      : !response?.items.length ? <p>Chưa có ca trong khoảng ngày đã chọn.</p> : <ul className="shifts-list">
        {response.items.map(row => <li key={row.id}>
          <div>
            <strong>{manager ? row.staff.fullName : row.facility.name}</strong>
            <p>{formatTime(row.startsAt)} – {formatTime(row.endsAt)}</p>
            <small>{attendanceLabel[row.attendance]}{row.reason ? ` · ${row.reason}` : ''}</small>
          </div>
          <div className="shifts-actions">
            {manager && row.status === 'SCHEDULED' && row.attendance !== 'CHECKED_OUT' && <>
              {row.attendance === 'NOT_CHECKED_IN' && <button className="button-secondary" disabled={busy} onClick={() => {
                setStatusEdit(undefined);
                setDraft({ id: row.id, revision: row.revision, staffUserId: row.staffUserId, startsAt: localInput(row.startsAt), endsAt: localInput(row.endsAt) });
              }}>Đổi ca</button>}
              <button className="button-secondary" disabled={busy} onClick={() => {
                setDraft(undefined); setStatusEdit({ row, reason: '', status: 'ON_LEAVE' });
              }}>Ghi nhận ca</button>
            </>}
            {!manager && row.attendance === 'NOT_CHECKED_IN' && Date.parse(row.startsAt) <= serverTime && Date.parse(row.endsAt) > serverTime &&
              <button className="button-primary" disabled={busy} onClick={() => void save(`/staff/shifts/${row.id}/check-in`, 'PATCH')}>Xác nhận vào ca</button>}
            {!manager && row.status === 'SCHEDULED' && (row.attendance === 'PRESENT' || row.attendance === 'ENDED' && row.checkedInAt && !row.checkedOutAt) &&
              <button className="button-secondary" disabled={busy} onClick={() => void save(`/staff/shifts/${row.id}/check-out`, 'PATCH')}>Kết thúc ca</button>}
          </div>
        </li>)}
      </ul>}
  </main>;
}
