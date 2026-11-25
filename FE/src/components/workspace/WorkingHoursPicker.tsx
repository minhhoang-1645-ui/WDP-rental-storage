import { useId, useRef, useState } from 'react';
import { markFormDirty } from '../../services/live-events';
import { TimePicker } from './DateTimeFields';

const days = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'];
const shortDays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const allDays = days.map((_, index) => index);
const modes = { custom: 'Tùy chọn ngày', daily: 'Hằng ngày', always: '24/7' } as const;
type Mode = keyof typeof modes;
type Hours = { start: string; end: string; selected: number[]; mode: Mode };
const blank: Hours = { start: '', end: '', selected: [], mode: 'custom' };
const normalize = (value: string) => value.trim().toLocaleLowerCase('vi');
const dayIndex = (value: string) => days.findIndex((day, index) => [normalize(day), normalize(shortDays[index])].includes(normalize(value)));

function parseHours(value: string): Hours | null {
  if (!value.trim()) return blank;
  if (value.trim() === '24/7') return { ...blank, mode: 'always' };
  const parts = /^(\d\d:\d\d)\s*[-–—]\s*(\d\d:\d\d)(\s*\(qua nửa đêm\))?(?:\s*[,·]\s*|\s+)(.+)$/i.exec(value.trim());
  if (!parts) return null;
  const [, start, end, overnight, dayText] = parts;
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!clock.test(start) || !clock.test(end) || start === end || (overnight && end >= start)) return null;
  if (['hằng ngày', 'hàng ngày'].includes(normalize(dayText))) return { start, end, selected: [], mode: 'daily' };
  const selected = dayText.split(',').flatMap(item => {
    const [first, last, extra] = item.split(/[-–—]|\s+đến\s+/i);
    const from = dayIndex(first);
    const to = last === undefined ? from : dayIndex(last);
    return from < 0 || to < from || extra !== undefined ? [-1] : allDays.slice(from, to + 1);
  });
  if (selected.includes(-1)) return null;
  const unique = [...new Set(selected)].sort();
  return { start, end, selected: unique, mode: unique.length === days.length ? 'daily' : 'custom' };
}

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

export function WorkingHoursPicker({ name, label, original = '', required, error, onEdit }: {
  name: string; label: string; original?: string; required?: boolean; error?: string; onEdit?: () => void;
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
    setHours(current => ({ ...current, ...patch }));
  }
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
      <small>Khung giờ hiện tại sẽ được giữ nguyên khi lưu.</small>
      <div><button type="button" className="button-secondary" onClick={() => setResetting(true)}>Thiết lập lại {label.toLocaleLowerCase('vi')}</button></div>
    </> : <>
      <div className="workspace-hours-modes" role="group" aria-label={'Chế độ · ' + label}>
        {Object.entries(modes).map(([mode, text]) => <label key={mode}>
          <input type="radio" name={name + 'Mode'} value={mode} checked={hours.mode === mode}
            onChange={() => update({ mode: mode as Mode })} /><span>{text}</span>
        </label>)}
      </div>
      {hours.mode === 'custom' && <div className="workspace-hours-days" role="group" aria-label={'Ngày áp dụng · ' + label}>
        {days.map((day, index) => <button key={day} type="button" className="button-secondary" aria-label={day}
          aria-pressed={hours.selected.includes(index)}
          onClick={() => update({ selected: hours.selected.includes(index) ? hours.selected.filter(value => value !== index) : [...hours.selected, index].sort() })}>{shortDays[index]}</button>)}
      </div>}
      <div className="workspace-date-pair workspace-hours-times" key={revision} hidden={hours.mode === 'always'}>
        <TimePicker label="Từ giờ" compact defaultValue={hours.start} disabled={hours.mode === 'always'} onChange={start => update({ start })}
          onPartsChange={parts => setPartialTimes(current => ({ ...current, start: parts.some(Boolean) }))} />
        <TimePicker label="Đến giờ" compact defaultValue={hours.end} disabled={hours.mode === 'always'} onChange={end => update({ end })}
          onPartsChange={parts => setPartialTimes(current => ({ ...current, end: parts.some(Boolean) }))} />
      </div>
      <div className="workspace-hours-summary" hidden={!showPreview && !changed && !resetting}>
        <p className="workspace-hours-preview" aria-live="polite">{showPreview ? preview : ''}</p>
        {(changed || resetting) && <button type="button" className="portal-text-button" onClick={() => {
        onEdit?.();
        setHours(previous ?? blank); setChanged(false); setResetting(false); setPartialTimes({ start: false, end: false }); setRevision(value => value + 1);
        }}>{original ? 'Khôi phục khung giờ ban đầu' : 'Xóa lựa chọn khung giờ'}</button>}
      </div>
    </>}
    {problem && <small id={errorId} className="workspace-date-error" role="alert">{problem}</small>}
  </fieldset>;
}
