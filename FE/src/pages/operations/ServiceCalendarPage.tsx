import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../../services/api';
import { useApiResource } from '../../services/useApiResource';
import { useAuth } from '../../auth/auth-context';
import { label } from '../../components/manager/portal-data';
import { DateTimePicker } from '../../components/workspace/DateTimeFields';
import { mutate } from '../../services/portal';
import '../../styles/staff-shifts.css';

const timeZone = 'Asia/Ho_Chi_Minh';
const localDate = (date: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone }).format(date);
const formatTime = (time: string) => new Intl.DateTimeFormat('vi-VN', { timeZone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(time));
type AgendaRow = {
  id: string; type: 'appointments' | 'transfers' | 'returns'; code: string; scheduledAt: string;
  status: string; proposed: boolean; assignedStaff: { fullName: string } | null;
  warning?: string;
};
const titles = { appointments: 'Bàn giao kho', transfers: 'Chuyển kho', returns: 'Kiểm tra trả kho' };

export function ServiceCalendarPage() {
  const { user } = useAuth();
  const [date, setDate] = useState(() => localDate(new Date()));
  const [span, setSpan] = useState(7);
  const [creating, setCreating] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const start = date ? new Date(date + 'T00:00:00+07:00') : null;
  const query = start && new URLSearchParams({
    from: start.toISOString(), to: new Date(+start + span * 86400000).toISOString(),
  });
  const data = useApiResource<{ items: AgendaRow[] }>(query ? `/manager/service-calendar?${query}` : null, user?.id);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !scheduledAt) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError('');
    try {
      await mutate('/manager/appointments', 'POST', {
        reservationId: String(form.get('reservationId') ?? '').trim(), scheduledAt: scheduledAt + '+07:00',
        note: String(form.get('note') ?? '').trim(),
      }, true);
      setCreating(false);
      setScheduledAt('');
      data.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Không lưu được lịch bàn giao.');
    } finally {
      setSaving(false);
    }
  }
  return <section className="shifts-page">
    <h1>Lịch phục vụ</h1>
    <div className="shifts-toolbar">
      <label>Từ ngày<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <label>Phạm vi<select value={span} onChange={event => setSpan(Number(event.target.value))}><option value={1}>Một ngày</option><option value={7}>Một tuần</option></select></label>
      <button className="button-secondary" onClick={data.refresh}>Làm mới</button>
      <button className="button-primary" disabled={saving} onClick={() => setCreating(!creating)}>{creating ? 'Đóng biểu mẫu' : 'Đặt lịch bàn giao thay khách'}</button>
    </div>
    {creating && <form className="portal-form" onSubmit={create}>
      <label className="field-label">Mã đặt kho<input name="reservationId" required maxLength={120} disabled={saving} /></label>
      <DateTimePicker label="Giờ nhận kho (UTC+7)" required disabled={saving} onChange={setScheduledAt} />
      <label className="field-label">Ghi chú<input name="note" maxLength={500} disabled={saving} /></label>
      {error && <p role="alert">{error}</p>}
      <button className="button-primary" disabled={saving || !scheduledAt}>{saving ? 'Đang lưu…' : 'Lưu lịch bàn giao'}</button>
    </form>}
    {data.loading ? <p role="status">Đang tải lịch…</p> : data.error ? <p role="alert">{data.error}</p>
      : !data.data?.items.length ? <p>Chưa có lịch trong khoảng ngày đã chọn.</p> : <ul className="shifts-list">
        {data.data.items.map(row => <li key={row.type + ':' + row.id}><div>
          <Link to={`/manager/operations/${row.type}/${encodeURIComponent(row.id)}`}><strong>{titles[row.type]} · {row.code}</strong></Link>
          <p>{formatTime(row.scheduledAt)}{row.proposed ? ' · Giờ khách đề xuất' : ''}</p>
          <small>{label(row.status)} · {row.assignedStaff?.fullName ?? 'Chưa phân công'}</small>
          {row.warning && <p className="shifts-warning" role="status">{row.warning}. Cần quản lý xem xét lịch hẹn.</p>}
        </div></li>)}
      </ul>}
  </section>;
}

export function ReturnInspectionSchedule({ id, current, onUpdated }: { id: string; current: string | null; onUpdated: () => void }) {
  const [schedule, setSchedule] = useState('');
  const [reason, setReason] = useState('');
  const [cancel, setCancel] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await apiRequest(`/manager/service-calendar/returns/${encodeURIComponent(id)}`, {
        method: 'PATCH', body: JSON.stringify({ scheduledAt: cancel ? null : schedule + '+07:00', expectedScheduledAt: current, reason }),
      });
      setReason('');
      setSchedule('');
      setCancel(false);
      onUpdated();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Không thể lưu lịch kiểm tra.');
    } finally {
      setPending(false);
    }
  }
  return <form className="portal-form" onSubmit={submit}>
    <strong>Lịch kiểm tra trả kho</strong>
    {current && <p>{formatTime(current)}</p>}
    {current && <label><input type="checkbox" checked={cancel} onChange={event => setCancel(event.target.checked)} />Hủy lịch kiểm tra</label>}
    {!cancel && <label className="field-label">Giờ kiểm tra (giờ Việt Nam)<input required type="datetime-local" value={schedule} onChange={event => setSchedule(event.target.value)} /></label>}
    <label className="field-label">Lý do<input required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
    {error && <p role="alert">{error}</p>}
    <button className="button-secondary" disabled={pending}>{cancel ? 'Hủy lịch' : 'Lưu lịch kiểm tra'}</button>
  </form>;
}
