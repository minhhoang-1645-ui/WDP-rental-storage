import { Plus, Trash2 } from 'lucide-react';
import { TimePicker } from '../../components/workspace/DateTimeFields';
import { allDays, covers, days, shortDays, type ServiceWindow, type Week } from '../../components/workspace/working-hours';

export type ServiceGroup = Omit<ServiceWindow, 'weekday'> & { id: number; weekdays: number[] };
const weekdays = allDays.map(day => day + 1);
const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function groupWindows(windows: ServiceWindow[]) {
  const groups = new Map<string, ServiceGroup>();
  for (const { weekday, starts, ends, capacity } of windows) {
    const key = JSON.stringify([starts, ends, capacity]);
    const existing = groups.get(key);
    if (existing && !existing.weekdays.includes(weekday)) existing.weekdays.push(weekday);
    else groups.set(existing ? key + ':' + groups.size : key, { id: groups.size, weekdays: [weekday], starts, ends, capacity });
  }
  return [...groups.values()];
}

export function expandGroups(groups: ServiceGroup[]) {
  return groups.flatMap(({ weekdays, starts, ends, capacity }) => weekdays.map(weekday => ({ weekday, starts, ends, capacity })));
}

export function serviceIssues(groups: ServiceGroup[], access: Week | null) {
  return groups.map((row, index) => {
    if (!row.weekdays.length) return 'Chọn ít nhất một ngày phục vụ.';
    if (!clock.test(row.starts) || (!clock.test(row.ends) && row.ends !== '24:00') || row.starts >= row.ends)
      return 'Chọn giờ bắt đầu và kết thúc hợp lệ.';
    if (!Number.isSafeInteger(row.capacity) || row.capacity < 1) return 'Số lịch hẹn phải là số nguyên dương.';
    const outside = row.weekdays.find(day => !covers(access?.[day - 1], row.starts, row.ends));
    if (outside) return `${days[outside - 1]}: khung giờ ${row.starts}–${row.ends} vượt quá giờ khách truy cập kho.`;
    const overlap = row.weekdays.find(day => groups.some((other, position) => position !== index
      && other.weekdays.includes(day) && clock.test(other.starts) && (clock.test(other.ends) || other.ends === '24:00')
      && other.starts < other.ends && row.starts < other.ends && other.starts < row.ends));
    return overlap ? `${days[overlap - 1]}: khung giờ phục vụ bị chồng lấn.` : '';
  });
}

function clockParts(value: string): [string, string] {
  const [hour, minute = ''] = value.split(':');
  return [hour, minute];
}

export function FacilityServiceSchedule({ groups, access, errors, onChange }: {
  groups: ServiceGroup[]; access: Week | null; errors: string[]; onChange: (groups: ServiceGroup[]) => void;
}) {
  const allowedDays = weekdays.filter(day => access?.[day - 1].length);
  function update(id: number, patch: Partial<ServiceGroup>) {
    onChange(groups.map(row => row.id === id ? { ...row, ...patch } : row));
  }
  return <fieldset className="bom-facility-span bom-service-windows">
    <legend>Lịch phục vụ khách hàng (tùy chọn)</legend>
    <p>{groups.length ? 'Thiết lập khung giờ và số lịch hẹn tối đa cho bàn giao và kiểm tra trả kho.' : 'Lịch hẹn do quản lý cơ sở xác nhận.'}</p>
    {groups.map((row, index) => {
      const allowTime = (key: 'starts' | 'ends', time: string) => row.weekdays.length > 0 && row.weekdays.every(day =>
        access?.[day - 1].some(span => key === 'starts' ? span.start <= time && time < span.end
          : row.starts ? span.start <= row.starts && row.starts < time && time <= span.end : span.start < time && time <= span.end));
      return <div className="bom-service-window" key={row.id}>
        <div className="bom-service-days">
          <span>Ngày phục vụ</span>
          <div className="workspace-hours-days" role="group" aria-label={`Ngày phục vụ · Khung ${index + 1}`}>
            <button type="button" className="button-secondary" disabled={allowedDays.length !== 7}
              aria-pressed={row.weekdays.length === 7} onClick={() => update(row.id, { weekdays: row.weekdays.length === 7 ? [] : weekdays })}>Hằng ngày</button>
            {weekdays.map(day => <button key={day} type="button" className="button-secondary" aria-label={days[day - 1]}
              aria-pressed={row.weekdays.includes(day)} disabled={!allowedDays.includes(day) && !row.weekdays.includes(day)}
              onClick={() => update(row.id, { weekdays: row.weekdays.includes(day)
                ? row.weekdays.filter(value => value !== day) : [...row.weekdays, day].sort() })}>{shortDays[day - 1]}</button>)}
          </div>
        </div>
        <TimePicker label="Từ giờ" compact parts={clockParts(row.starts)} disabled={!row.weekdays.length}
          allowTime={time => allowTime('starts', time)} onPartsChange={parts => update(row.id, { starts: parts.join(':') })} />
        <TimePicker label="Đến giờ" compact allowEndOfDay parts={clockParts(row.ends)} disabled={!row.weekdays.length}
          allowTime={time => allowTime('ends', time)} onPartsChange={parts => update(row.id, { ends: parts.join(':') })} />
        <label className="field-label">Số lịch hẹn tối đa mỗi khung<input type="number" min={1} step={1} value={row.capacity || ''}
          aria-invalid={!Number.isSafeInteger(row.capacity) || row.capacity < 1}
          onChange={event => update(row.id, { capacity: Number(event.target.value) })} /></label>
        <button type="button" className="button-secondary bom-service-delete" aria-label={`Xóa khung ${index + 1}`}
          onClick={() => onChange(groups.filter(other => other.id !== row.id))}><Trash2 size={17} aria-hidden="true" /></button>
        {errors[index] && <small className="bom-facility-field-error" role="alert">{errors[index]}</small>}
      </div>;
    })}
    <button name="serviceSchedule" type="button" className="button-secondary"
      onClick={() => onChange([...groups, { id: Math.max(-1, ...groups.map(row => row.id)) + 1, weekdays: [], starts: '', ends: '', capacity: 0 }])}>
      <Plus size={16} aria-hidden="true" /> Thêm khung giờ
    </button>
  </fieldset>;
}
