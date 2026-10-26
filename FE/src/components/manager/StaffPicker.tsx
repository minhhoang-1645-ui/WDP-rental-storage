import { useEffect, useId, useState } from 'react';
import { useAuth } from '../../auth/auth-context';
import { apiRequest } from '../../services/api';
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
    if (!['MANAGER', 'ADMIN'].includes(user?.role ?? '')) return;
    const controller = new AbortController();
    apiRequest<{ items: Array<{ id: string; fullName: string; email?: string }> }>('/manager/staff?limit=100', { authenticated: true, signal: controller.signal })
      .then(response => {
        if (controller.signal.aborted) return;
        setResult({ key, staff: new Map(response.items.map(staff => [staff.id, staff.fullName + (staff.email ? ` · ${staff.email}` : '')])), error: false });
      })
      .catch(async () => {
        try {
          const pages = await Promise.allSettled(['/manager/maintenance', '/manager/support-requests', '/manager/stock-movements'].map(path => allPages(path, controller.signal)));
          if (!controller.signal.aborted) setResult({ key, staff: staffFromWork(pages.flatMap(page => page.status === 'fulfilled' ? page.value.items : [])), error: true });
        } catch {
          if (!controller.signal.aborted) setResult({ key, staff: new Map(), error: true });
        }
      });
    return () => controller.abort();
  }, [key, user?.role]);
  const current = result?.key === key ? result : undefined;
  const options = new Map([...(knownStaff ?? []), ...(current?.staff ?? [])]);
  if (currentStaff) options.set(currentStaff.id, currentStaff.fullName);
  const loading = !current;
  const showManual = manual || (!loading && !options.size) || (Boolean(value) && !options.has(value));
  return <div className="staff-assignee-picker">
    <label className="field-label">Nhân viên phụ trách
      <select aria-label="Nhân viên phụ trách" aria-describedby={hintId} value={options.has(value) && !manual ? value : ''} disabled={disabled || !options.size} required={!showManual} onChange={event => { setManual(false); onChange(event.target.value); }}>
        <option value="">{loading && !options.size ? 'Đang tải danh sách nhân viên…' : options.size ? 'Chọn nhân viên' : 'Chưa có nhân viên đang hoạt động'}</option>
        {[...options].sort((a, b) => a[1].localeCompare(b[1], 'vi')).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
    <p id={hintId} className="staff-assignee-hint">Chọn nhân viên kho đang hoạt động để giao việc.</p>
    {current?.error && <div className="staff-assignee-hint" role="status">Không tải được danh sách nhân viên mới nhất. Bạn có thể chọn dữ liệu đang có hoặc <button type="button" className="portal-text-button" disabled={disabled} onClick={() => setRevision(value => value + 1)}>Tải lại danh sách</button>.</div>}
    {showManual ? <div><label className="field-label">Mã tài khoản nhân viên<input required maxLength={100} autoComplete="off" spellCheck={false} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} placeholder="Dán mã tài khoản khi cần" /></label><small>Chỉ dùng khi cần giữ nguyên người đã được phân công trong hồ sơ cũ.</small></div> : <button className="portal-text-button" type="button" disabled={disabled} onClick={() => { setManual(true); onChange(''); }}>Nhập mã nhân viên khác</button>}
  </div>;
}
