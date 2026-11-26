import { useId, useRef, useState } from 'react';
import { markFormDirty } from '../../services/live-events';
import { TimePicker } from './DateTimeFields';

import { allDays, blank, covers, days, modes, parseHours, shortDays, type Hours, type Mode, type Week } from './working-hours';

function summarize(hours: Hours) {
  if (hours.mode === 'always') return '24/7';
  const { start, end } = hours;
  const selected = hours.mode === 'daily' ? allDays : hours.selected;
  if (!start || !end || start === end || !selected.length) return '';
  const first = selected[0], last = selected[selected.length - 1];
  const dayLabel = selected.length === days.length ? 'Hằng ngày' : selected.length > 1 && last - first + 1 === selected.length
    ? days[first] + '–' + days[last] : selected.map(index => days[index]).join(', ');
  return start + '–' + end + (end < start ? ' (qua nửa đêm)' : '') + ', ' + dayLabel;
}

export function WorkingHoursPicker({ name, label, original = '', required, error, onEdit, onValueChange, limits }: {
  name: string; label: string; original?: string; required?: boolean; error?: string; onEdit?: () => void;
  onValueChange?: (value: string, incomplete: boolean) => void; limits?: Week | null;
}) {
  const [previous] = useState(() => parseHours(original));
  const [hours, setHours] = useState(previous ?? blank);
  const [changed, setChanged] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [revision, setRevision] = useState(0);
  const [partialTimes, setPartialTimes] = useState({ start: false, end: false });
  const errorId = useId();
  const field = useRef<HTMLFieldSetElement>(null);
  function update(patch: Partial<Hours>) {
    if (field.current?.form) markFormDirty(field.current.form);
    onEdit?.();
    setChanged(true);
    const next = { ...hours, ...patch };
    const value = summarize(next);
    setHours(next);
    onValueChange?.(value, !value);
  }
  const selected = hours.mode === 'daily' ? allDays : hours.selected;
  const dayAllowed = (day: number) => limits === undefined || Boolean(limits?.[day].length);
  const timeAllowed = (key: 'start' | 'end', clock: string) => {
    if (limits === undefined) return true;
    if (!limits) return false;
    if (key === 'start' || !hours.start) return selected.every(day => limits[day].some(span =>
      key === 'start' ? span.start <= clock && clock < span.end : span.start < clock && clock <= span.end));
    if (clock > hours.start) return selected.every(day => covers(limits[day], hours.start, clock));
    return clock !== hours.start && selected.every(day => covers(limits[day], hours.start, '24:00')
      && (clock === '00:00' || covers(limits[(day + 1) % 7], '00:00', clock)));
  };
  const preview = summarize(hours);
  const showPreview = Boolean(preview && (hours.mode === 'custom' || (hours.mode === 'daily' && hours.end < hours.start)));
  const partial = Boolean(hours.mode !== 'custom' || hours.start || hours.end || hours.selected.length || partialTimes.start || partialTimes.end);
  const problem = error || (changed && !preview && (partial || required)
    ? hours.start && hours.start === hours.end ? 'Giờ kết thúc phải khác giờ bắt đầu. Chọn 24/7 nếu mở cả ngày.' : 'Chọn đủ giờ bắt đầu, giờ kết thúc và ít nhất một ngày.' : '');
  return <fieldset className="workspace-hours" ref={field} data-hours-field={name} aria-describedby={problem ? errorId : undefined}>
    <legend>{label}{required && ' *'}</legend>
    <input type="hidden" name={name} value={changed ? preview : ''} />
    <input type="hidden" name={name + 'Changed'} value={changed ? 'yes' : ''} />
    <input type="hidden" name={name + 'Partial'} value={changed && partial && !preview ? 'yes' : ''} />
    {!previous && !resetting ? <>
      <p className="workspace-hours-preview">{original}</p>
      <small>Cần thiết lập lại khi chỉnh lịch hoạt động hoặc bật nhận đặt kho mới.</small>
      <div><button type="button" className="button-secondary" onClick={() => setResetting(true)}>Thiết lập lại {label.toLocaleLowerCase('vi')}</button></div>
    </> : <>
      <div className="workspace-hours-modes" role="group" aria-label={'Chế độ · ' + label}>
        {Object.entries(modes).map(([mode, text]) => <label key={mode}>
          <input type="radio" name={name + 'Mode'} value={mode} checked={hours.mode === mode}
            disabled={mode === 'daily' ? !allDays.every(dayAllowed)
              : mode === 'always' && limits !== undefined && !allDays.every(day => covers(limits?.[day], '00:00', '24:00'))}
            onChange={() => update({ mode: mode as Mode })} /><span>{text}</span>
        </label>)}
      </div>
      {hours.mode === 'custom' && <div className="workspace-hours-days" role="group" aria-label={'Ngày áp dụng · ' + label}>
        {days.map((day, index) => <button key={day} type="button" className="button-secondary" aria-label={day}
          aria-pressed={hours.selected.includes(index)} disabled={!dayAllowed(index) && !hours.selected.includes(index)}
          onClick={() => update({ selected: hours.selected.includes(index) ? hours.selected.filter(value => value !== index) : [...hours.selected, index].sort() })}>{shortDays[index]}</button>)}
      </div>}
      <div className="workspace-date-pair workspace-hours-times" key={revision} hidden={hours.mode === 'always'}>
        <TimePicker label="Từ giờ" compact defaultValue={hours.start} disabled={hours.mode === 'always'} allowTime={clock => timeAllowed('start', clock)} onChange={start => update({ start })}
          onPartsChange={parts => setPartialTimes(current => ({ ...current, start: parts.some(Boolean) }))} />
        <TimePicker label="Đến giờ" compact allowEndOfDay defaultValue={hours.end} disabled={hours.mode === 'always'} allowTime={clock => timeAllowed('end', clock)} onChange={end => update({ end })}
          onPartsChange={parts => setPartialTimes(current => ({ ...current, end: parts.some(Boolean) }))} />
      </div>
      <div className="workspace-hours-summary" hidden={!showPreview && !changed && !resetting && !original}>
        <p className="workspace-hours-preview" aria-live="polite">{showPreview ? preview : ''}</p>
        {(changed || resetting) && <button type="button" className="portal-text-button" onClick={() => {
        onEdit?.();
        onValueChange?.(original, false);
        setHours(previous ?? blank); setChanged(false); setResetting(false); setPartialTimes({ start: false, end: false }); setRevision(value => value + 1);
        }}>{original ? 'Khôi phục khung giờ ban đầu' : 'Xóa lựa chọn khung giờ'}</button>}
        {original && preview && <button type="button" className="portal-text-button" onClick={() => {
          update(blank); onValueChange?.('', false); setRevision(value => value + 1);
        }}>Xóa lựa chọn khung giờ</button>}
      </div>
    </>}
    {problem && <small id={errorId} className="workspace-date-error" role="alert">{problem}</small>}
  </fieldset>;
}
