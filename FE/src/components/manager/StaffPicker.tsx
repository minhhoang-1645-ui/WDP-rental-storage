import { useEffect, useId, useState } from 'react';
import { useAuth } from '../../auth/auth-context';
import { allPages } from '../../services/portal';
import { staffFromWork } from '../../utils/staff';

export function StaffPicker({ value, onChange, disabled = false, knownStaff, currentStaff }: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  knownStaff?: Map<string, string>;
  currentStaff?: { id: string; fullName: string } | null;
}) {
  const { user } = useAuth(), hintId = useId();
  const [manual, setManual] = useState(false), [revision, setRevision] = useState(0);
  const key = `${user?.id}:${revision}`;
  const [result, setResult] = useState<{ key: string; staff: Map<string, string>; error: boolean }>();
  useEffect(() => {
    if (knownStaff || user?.role !== 'MANAGER') return;
    const controller = new AbortController();
    Promise.allSettled(['/manager/maintenance', '/manager/support-requests', '/manager/stock-movements'].map(path => allPages(path, controller.signal)))
      .then(pages => {
        if (controller.signal.aborted) return;
        setResult({ key, staff: staffFromWork(pages.flatMap(page => page.status === 'fulfilled' ? page.value.items : [])), error: pages.some(page => page.status === 'rejected') });
      });
    return () => controller.abort();
  }, [key, knownStaff, user?.role]);
  const current = result?.key === key ? result : undefined;
  const options = new Map(knownStaff ?? current?.staff ?? []);
  if (currentStaff) options.set(currentStaff.id, currentStaff.fullName);
  const loading = !knownStaff && !current;
  const showManual = manual || (!loading && !options.size) || (Boolean(value) && !options.has(value));
  return <div className="staff-assignee-picker">
    <label className="field-label">Nhân viên phụ trách
      <select aria-label="Nhân viên phụ trách" aria-describedby={hintId} value={options.has(value) && !manual ? value : ''} disabled={disabled || !options.size} required={!showManual} onChange={event => { setManual(false); onChange(event.target.value); }}>
        <option value="">{loading && !options.size ? 'Đang tải nhân viên…' : options.size ? 'Chọn nhân viên' : 'Chưa có nhân viên trong lịch sử'}</option>
        {[...options].sort((a, b) => a[1].localeCompare(b[1], 'vi')).map(([id, name]) => <option key={id} value={id}>{name} · {id}</option>)}
      </select>
    </label>
    <p id={hintId} className="staff-assignee-hint">Chọn nhân viên từng xuất hiện trong công việc. Nhân viên mới có thể được phân công bằng mã tài khoản do quản trị viên cung cấp.</p>
    {current?.error && <div className="staff-assignee-hint" role="status">Chưa tải đủ lịch sử nhân viên. Bạn có thể chọn từ dữ liệu đã tải, nhập mã hoặc <button type="button" className="portal-text-button" disabled={disabled} onClick={() => setRevision(value => value + 1)}>Tải lại danh sách</button>.</div>}
    {showManual ? <div><label className="field-label">Mã tài khoản nhân viên<input required maxLength={100} autoComplete="off" spellCheck={false} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} placeholder="Dán mã tài khoản, không phải email" /></label><small>Mã tài khoản nằm trong hồ sơ người dùng ở mục Quản lý tài khoản của quản trị viên.</small></div> : <button className="portal-text-button" type="button" disabled={disabled} onClick={() => { setManual(true); onChange(''); }}>Nhập mã nhân viên khác</button>}
  </div>;
}
