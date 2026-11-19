import { EntitySelect } from '../EntitySelect';
import { useEffect, useId, useState } from 'react';
import { useAuth } from '../../auth/auth-context';
import { allPages } from '../../services/portal';
import { isFixtureStaff, staffFromWork } from '../../utils/staff';
import { markFormDirty } from '../../services/live-events';

export function StaffPicker({ value, onChange, disabled = false, knownStaff, currentStaff, workloads, list = false }: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  knownStaff?: Map<string, string>;
  currentStaff?: { id: string; fullName: string; email?: string } | null;
  workloads?: Map<string, number>;
  list?: boolean;
}) {
  const { user } = useAuth(), hintId = useId();
  const [manual, setManual] = useState(false), [revision, setRevision] = useState(0);
  const [search, setSearch] = useState('');
  const key = `${user?.id}:${revision}`;
  const [result, setResult] = useState<{ key: string; staff: Map<string, string>; error: boolean }>();
  useEffect(() => {
    if (user?.role !== 'MANAGER') return;
    const controller = new AbortController();
    allPages<{ id: string; fullName: string; email?: string }>('/manager/staff?limit=100', controller.signal)
      .then(response => {
        if (controller.signal.aborted) return;
        setResult({ key, staff: new Map(response.items.filter(staff => !isFixtureStaff(staff)).map(staff => [staff.id, staff.fullName + (staff.email ? ` · ${staff.email}` : '')])), error: false });
      })
      .catch(async () => {
        if (list) {
          if (!controller.signal.aborted) setResult({ key, staff: new Map(), error: true });
          return;
        }
        try {
          const pages = await Promise.allSettled(['/manager/maintenance', '/manager/support-requests', '/manager/stock-movements', '/manager/appointments'].map(path => allPages(path, controller.signal)));
          if (!controller.signal.aborted) setResult({ key, staff: staffFromWork(pages.flatMap(page => page.status === 'fulfilled' ? page.value.items : [])), error: true });
        } catch {
          if (!controller.signal.aborted) setResult({ key, staff: new Map(), error: true });
        }
      });
    return () => controller.abort();
  }, [key, list, user?.role]);
  const current = result?.key === key ? result : undefined;
  const options = new Map([...(current?.error ? knownStaff ?? [] : []), ...(current?.staff ?? [])]);
  if (currentStaff && !options.has(currentStaff.id)) options.set(currentStaff.id, [currentStaff.fullName, currentStaff.email].filter(Boolean).join(' · '));
  const loading = !current;
  const showManual = manual || (!loading && !options.size) || (Boolean(value) && !options.has(value));
  const normalize = (text: string) => text.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  const filtered = [...options].filter(([id, name]) => id === value || normalize(name).includes(normalize(search.trim()))).sort((a,b) => (workloads ? (workloads.get(a[0]) ?? 0) - (workloads.get(b[0]) ?? 0) : 0) || a[1].localeCompare(b[1], 'vi'));
  const recommendation = workloads && current && !current.error ? [...current.staff].sort((a,b) => (workloads.get(a[0]) ?? 0) - (workloads.get(b[0]) ?? 0) || a[1].localeCompare(b[1], 'vi'))[0] : undefined;
  if (list) {
    const selectedOwner = currentStaff?.id === value ? value : undefined;
    const choices = filtered
      .filter(([id, name]) => id === selectedOwner || (current && !current.error && normalize(name).includes(normalize(search.trim()))))
      .sort(([a], [b]) => Number(b === selectedOwner) - Number(a === selectedOwner));
    return <div className="staff-assignee-picker">
      <label className="field-label">Tìm nhân viên<input type="search" placeholder="Tên hoặc email" value={search} disabled={disabled} onChange={event => setSearch(event.target.value)} /></label>
      {loading && <p role="status">Đang tải nhân viên…</p>}
      {current?.error && <div role="alert">Chưa tải được danh sách nhân viên. <button type="button" className="portal-text-button" disabled={disabled} onClick={() => setRevision(value => value + 1)}>Thử lại</button></div>}
      {choices.length > 0 && <fieldset className="assignment-staff-list" disabled={disabled}>
        <legend>Chọn nhân viên</legend>
        {choices.map(([id, display]) => {
          const [name, email] = display.split(' · ');
          return <label key={id} className="assignment-staff-option">
            <input type="radio" name={hintId} value={id} checked={value === id} onChange={() => onChange(id)} />
            <span><strong>{name}</strong>{email && <small>{email}</small>}</span>
            {workloads && <small>{workloads.get(id) ?? 0} việc đang mở</small>}
          </label>;
        })}
      </fieldset>}
      {!loading && !current?.error && choices.length === 0 && <p role="status">Không có nhân viên phù hợp.</p>}
    </div>;
  }
  return <div className="staff-assignee-picker">
    {recommendation && <div className="activity-update-note"><span>Gợi ý: {recommendation[1]} · {workloads?.get(recommendation[0]) ?? 0} việc chưa hoàn tất trong các nhóm đang phân công. Bạn kiểm tra rồi bấm lưu để xác nhận.</span><button type="button" className="portal-text-button" disabled={disabled || value === recommendation[0]} onClick={event => { const form = event.currentTarget.closest('form'); if (form) markFormDirty(form); setManual(false); onChange(recommendation[0]); }}>Dùng gợi ý</button></div>}
    <label className="field-label">Tìm nhân viên<input type="search" placeholder="Nhập tên hoặc email nhân viên…" value={search} disabled={disabled} onChange={event => setSearch(event.target.value)} /></label>
    <label className="field-label">Nhân viên phụ trách
      <EntitySelect aria-label="Nhân viên phụ trách" aria-describedby={hintId} value={options.has(value) && !manual ? value : ''} disabled={disabled || !options.size} required={!showManual} onValueChange={selectedValue => { setManual(false); onChange(selectedValue); }}>
        <option value="">{loading && !options.size ? 'Đang tải danh sách nhân viên…' : options.size ? 'Chọn nhân viên' : 'Chưa có nhân viên đang hoạt động'}</option>
        {filtered.map(([id, name]) => <option key={id} value={id}>{name}{workloads ? ` · ${workloads.get(id) ?? 0} việc chưa hoàn tất` : ''}</option>)}
      </EntitySelect>
    </label>
    <p id={hintId} className="staff-assignee-hint">{filtered.length} nhân viên phù hợp. Tài khoản kiểm thử đã được ẩn khỏi danh sách gợi ý.{workloads && ' Sắp xếp theo số việc chưa hoàn tất trong các nhóm hỗ trợ, bảo trì, nhập–xuất và bàn giao.'}</p>
    {value && options.has(value) && <div className="staff-choice-summary"><strong>Đang chọn: {options.get(value)}</strong>{workloads && <p>{workloads.get(value) ?? 0} công việc chưa hoàn tất.</p>}</div>}
    {current?.error && <div className="staff-assignee-hint" role="status">Không tải được danh sách nhân viên mới nhất. Bạn có thể chọn dữ liệu đang có hoặc <button type="button" className="portal-text-button" disabled={disabled} onClick={() => setRevision(value => value + 1)}>Tải lại danh sách</button>.</div>}
    {showManual ? <div><label className="field-label">Mã tài khoản nhân viên<input required maxLength={100} autoComplete="off" spellCheck={false} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} placeholder="Dán mã tài khoản khi cần" /></label><small>Chỉ dùng khi cần giữ nguyên người đã được phân công trong hồ sơ cũ.</small></div> : <button className="portal-text-button" type="button" disabled={disabled} onClick={() => { setManual(true); onChange(''); }}>Nhập mã nhân viên khác</button>}
  </div>;
}
