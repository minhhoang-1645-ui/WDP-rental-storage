import { useRef, useState, type FormEvent } from 'react';
import { mutate } from '../../services/portal';

export function StaffTaskException({ kind, id, waiting, refresh }: {
  kind: 'appointments' | 'returns'; id: string; waiting: boolean; refresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim();
    if (!reason) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await mutate(`/staff/assignment-queue/${kind}/${encodeURIComponent(id)}/escalate`, 'PATCH', { reason });
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể báo vướng mắc.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (waiting) return <p role="status">Đã báo vướng mắc. Công việc đang chờ quản lý xử lý.</p>;
  return <details className="manager-section">
    <summary>Báo vướng mắc hoặc đề nghị chuyển giao</summary>
    <form className="portal-form" onSubmit={submit}>
      <label className="field-label">Lý do và tiến độ đã thực hiện<textarea name="reason" required maxLength={500} rows={3} /></label>
      {error && <p className="booking-alert is-error" role="alert">{error}</p>}
      <button type="submit" className="button-secondary" disabled={busy}>{busy ? 'Đang gửi…' : 'Chuyển quản lý'}</button>
    </form>
  </details>;
}
