import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { markFormDirty } from '../../services/live-events';
import { vietnamCalendarDate } from '../../utils/business-date';
import './date-time-fields.css';

type Field = {
  label: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  error?: string;
};

const weekdays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const pad = (value: number) => String(value).padStart(2, '0');
const monthOffset = (month: string, offset: number) => {
  const date = new Date(month + '-01T00:00:00Z');
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
};
const displayDate = (date: string) => date.split('-').reverse().join('/');
const isCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
};

function placePicker(panel: HTMLDivElement, anchor: HTMLButtonElement, preferredWidth = 320, preferredHeight = 342) {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(preferredWidth, window.innerWidth - 24);
  panel.style.width = width + 'px';
  panel.style.left = Math.min(Math.max(rect.left, 12), window.innerWidth - width - 12) + 'px';
  const below = window.innerHeight - rect.bottom - 12;
  const above = rect.top - 12;
  const openAbove = below < preferredHeight && above > below;
  panel.style.top = openAbove ? 'auto' : rect.bottom + 4 + 'px';
  panel.style.bottom = openAbove ? window.innerHeight - rect.top + 4 + 'px' : 'auto';
  panel.style.maxHeight = Math.max(70, (openAbove ? above : below) - 4) + 'px';
}

function usePickerPosition(open: boolean, panel: RefObject<HTMLDivElement | null>, trigger: RefObject<HTMLButtonElement | null>, width?: number, height?: number) {
  useEffect(() => {
    if (!open) return;
    const position = () => {
      if (panel.current && trigger.current) placePicker(panel.current, trigger.current, width, height);
    };
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [open, panel, trigger, width, height]);
}

function useField({ value, defaultValue = '', onChange }: Field) {
  const [draft, setDraft] = useState(defaultValue);
  return [value ?? draft, (next: string) => { setDraft(next); onChange?.(next); }] as const;
}

// Retain the original serialized value and native form validation.
function FormValue({ name, value, required, disabled, error, onInvalid }: {
  name?: string; value: string; required?: boolean; disabled?: boolean; error?: string; onInvalid?: () => void;
}) {
  if (!required && !error) return name ? <input type="hidden" name={name} value={value} disabled={disabled} /> : null;
  return <input className="workspace-date-proxy" name={name} value={value} onChange={() => {}}
    required={required} disabled={disabled} ref={node => node?.setCustomValidity(error ?? '')}
    tabIndex={-1} aria-hidden="true" onInvalid={event => { event.preventDefault(); onInvalid?.(); }} />;
}

export function DatePicker(props: Field) {
  const { label, name, required, disabled, min, max, error } = props;
  const [value, change] = useField(props);
  const [invalid, setInvalid] = useState(false);
  const [open, setOpen] = useState(false);
  const [focusedDay, setFocusedDay] = useState('');
  const today = vietnamCalendarDate();
  const [month, setMonth] = useState(today.slice(0, 7));
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  usePickerPosition(open, popup, trigger);
  const blocked = (day: string) => Boolean((min && day < min) || (max && day > max));
  const rangeError = value && (!isCalendarDate(value) || blocked(value)) ? 'Chọn ngày trong phạm vi cho phép.' : '';
  const problem = error || rangeError || (invalid && !value ? 'Hãy chọn ngày.' : '');
  const show = () => {
    const panel = popup.current;
    const anchor = trigger.current;
    if (!panel || !anchor) return;
    if (panel.matches(':popover-open')) { panel.hidePopover(); return; }
    const initial = isCalendarDate(value) ? value : min && today < min && isCalendarDate(min) ? min :
      max && today > max && isCalendarDate(max) ? max : today;
    setFocusedDay(initial);
    setMonth(initial.slice(0, 7));
    placePicker(panel, anchor);
    panel.showPopover({ source: anchor });
    requestAnimationFrame(() => {
      if (!panel.matches(':popover-open')) return;
      (grid.current?.querySelector<HTMLButtonElement>(`[data-date="${initial}"]:not(:disabled)`)
        ?? grid.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]') ?? panel.querySelector('select'))?.focus();
    });
  };
  const pick = (day: string) => {
    const form = trigger.current?.form;
    if (form && day !== value) markFormDirty(form);
    change(day);
    setInvalid(false);
    if (popup.current?.matches(':popover-open')) popup.current.hidePopover();
    trigger.current?.focus({ preventScroll: true });
  };
  const days = new Date(monthOffset(month, 1) + '-01T00:00:00Z');
  days.setUTCDate(0);
  const blanks = (new Date(month + '-01T00:00:00Z').getUTCDay() + 6) % 7;
  const year = Number(month.slice(0, 4));
  const firstYear = Math.min(year, Number(min?.slice(0, 4) ?? 1900));
  const lastYear = Math.max(year, Number(max?.slice(0, 4) ?? 2100));
  const dates = Array.from({ length: days.getUTCDate() }, (_, index) => month + '-' + pad(index + 1));
  const firstAvailable = dates.find(day => !blocked(day));
  const tabDate = [focusedDay, value, today, firstAvailable].find(day => day && dates.includes(day) && !blocked(day));
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      popup.current?.hidePopover();
      trigger.current?.focus();
      return;
    }
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    const day = (event.target as HTMLElement).dataset.date;
    if (!offset || !day) return;
    event.preventDefault();
    const next = new Date(Date.parse(day + 'T00:00:00Z') + offset * 86_400_000).toISOString().slice(0, 10);
    if (blocked(next)) return;
    setFocusedDay(next);
    setMonth(next.slice(0, 7));
    requestAnimationFrame(() => grid.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus());
  }
  return <div className="field-label workspace-date-field">
    <span>{label}{required && ' *'}</span>
    <div className="workspace-date-control">
      <button type="button" className="workspace-date-trigger" ref={trigger} onClick={show} disabled={disabled}
        aria-label={label} aria-haspopup="dialog" aria-controls={id}
        aria-expanded={open} aria-invalid={Boolean(problem)} aria-describedby={id + '-value' + (problem ? ' ' + id + '-error' : '')}>
        <span id={id + '-value'}>{value ? displayDate(value) : 'dd/MM/yyyy'}</span><CalendarDays size={17} aria-hidden="true" />
      </button>
      {!required && value && <button type="button" className="workspace-date-clear" disabled={disabled} onClick={() => pick('')} aria-label={'Xóa ' + label}>×</button>}
    </div>
    <FormValue name={name} value={value} required={required} disabled={disabled} error={rangeError}
      onInvalid={() => { setInvalid(true); trigger.current?.focus(); }} />
    {problem && <small id={id + '-error'} className="workspace-date-error" role="alert">{problem}</small>}
    <div id={id} className="workspace-calendar" popover="auto" role="dialog" aria-label={'Lịch · ' + label} ref={popup}
      data-wdp-ignore-dirty="" onChange={event => event.stopPropagation()}
      onKeyDown={keyDown} onToggle={event => setOpen(event.currentTarget.matches(':popover-open'))}>
      <div className="workspace-calendar-nav">
        <button type="button" aria-label="Tháng trước" disabled={Boolean(min && month <= min.slice(0, 7))} onClick={() => setMonth(monthOffset(month, -1))}><ChevronLeft size={16} /></button>
        <select aria-label="Tháng" value={month.slice(5)} onChange={event => setMonth(year + '-' + event.target.value)}>
          {Array.from({ length: 12 }, (_, index) => pad(index + 1)).map(part => {
            const option = year + '-' + part;
            return <option key={part} value={part} disabled={Boolean((min && option < min.slice(0, 7)) || (max && option > max.slice(0, 7)))}>Tháng {Number(part)}</option>;
          })}
        </select>
        <select aria-label="Năm" value={year} onChange={event => {
          const next = event.target.value + month.slice(4);
          setMonth(min && next < min.slice(0, 7) ? min.slice(0, 7) : max && next > max.slice(0, 7) ? max.slice(0, 7) : next);
        }}>
          {Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index).map(option =>
            <option key={option} value={option}>{option}</option>)}
        </select>
        <button type="button" aria-label="Tháng sau" disabled={Boolean(max && month >= max.slice(0, 7))} onClick={() => setMonth(monthOffset(month, 1))}><ChevronRight size={16} /></button>
      </div>
      <div className="workspace-calendar-grid" ref={grid}>
        {weekdays.map(day => <span key={day}>{day}</span>)}
        {Array.from({ length: blanks }, (_, index) => <span key={'blank' + index} />)}
        {dates.map(day => <button type="button" key={day} data-date={day} aria-label={displayDate(day)} aria-current={day === today ? 'date' : undefined}
          aria-pressed={day === value} disabled={blocked(day)} tabIndex={day === tabDate ? 0 : -1} onClick={() => pick(day)}>{Number(day.slice(-2))}</button>)}
      </div>
    </div>
  </div>;
}

type TimeField = Field & { parts?: [string, string]; onPartsChange?: (parts: [string, string]) => void; compact?: boolean;
  allowEndOfDay?: boolean; allowTime?: (clock: string) => boolean };
const clockParts = (value: string): [string, string] => [value.slice(0, 2), value.slice(3, 5)];

export function TimePicker(props: TimeField) {
  const { label, name, required, disabled, min, max, parts, onPartsChange, error, compact, allowEndOfDay, allowTime } = props;
  const [draft, setDraft] = useState(() => clockParts(props.defaultValue ?? ''));
  const [checked, setChecked] = useState(false);
  const [hour, minute] = parts ?? (props.value !== undefined ? clockParts(props.value) : draft);
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  usePickerPosition(open, panel, trigger, 230, 145);
  const value = hour && minute ? hour + ':' + minute : '';
  const problem = error || (checked && !value ? 'Hãy chọn giờ và phút.' : '');
  const allowed = (clock: string) => (!min || clock >= min) && (!max || clock <= max)
    && (!clock.startsWith('24:') || Boolean(allowEndOfDay && clock === '24:00')) && (!allowTime || allowTime(clock));
  function hourAllowed(part: string) {
    if (part === '24') return allowed('24:00');
    if (!allowTime) return !(min && part + ':59' < min) && !(max && part + ':00' > max);
    return Array.from({ length: 60 }, (_, index) => pad(index)).some(minute => allowed(part + ':' + minute));
  }
  function change(index: number, part: string) {
    const next: [string, string] = index === 0 ? [part, minute] : [hour, part];
    if (next[0] === '24') next[1] = '00';
    if (index === 0 && next[1] && !allowed(next.join(':'))) next[1] = '';
    setDraft(next);
    onPartsChange?.(next);
    props.onChange?.(next.every(Boolean) ? next.join(':') : '');
  }
  const controls = <div className="workspace-clock">
      {[allowEndOfDay || hour === '24' ? 25 : 24, 60].map((count, index) => <select key={index} value={index === 0 ? hour : minute} disabled={disabled || (index === 1 && hour === '24')} required={required}
        aria-label={label + ' · ' + (index === 0 ? 'giờ' : 'phút')} aria-describedby={problem ? id + '-error' : undefined}
        aria-invalid={Boolean(problem)} onInvalid={event => {
          event.preventDefault(); setChecked(true);
          if (compact && !open) trigger.current?.focus();
          else event.currentTarget.focus();
        }}
        onChange={event => change(index, event.target.value)}>
        <option value="">{index === 0 ? 'Giờ' : 'Phút'}</option>
        {Array.from({ length: count }, (_, part) => pad(part)).map(part => <option key={part} value={part}
          disabled={index === 0 ? !hourAllowed(part) : Boolean(hour && !allowed(hour + ':' + part))}>{part}</option>)}
      </select>)}
    </div>;
  function close() {
    panel.current?.hidePopover();
    trigger.current?.focus({ preventScroll: true });
  }
  return <div className="field-label workspace-date-field" role="group" aria-labelledby={id}>
    <span id={id}>{label}{required && ' *'}</span>
    {compact ? <>
      <button type="button" className="workspace-date-trigger" ref={trigger} disabled={disabled} popoverTarget={id + '-clock'}
        aria-label={label} aria-describedby={id + '-value' + (problem ? ' ' + id + '-error' : '')} aria-haspopup="dialog" aria-invalid={Boolean(problem)}
        onClick={event => { if (panel.current) placePicker(panel.current, event.currentTarget, 230, 145); }}>
        <span id={id + '-value'}>{(hour || 'HH') + ':' + (minute || 'mm')}</span><Clock size={16} aria-hidden="true" />
      </button>
      <div className="workspace-calendar workspace-time-panel" id={id + '-clock'} ref={panel} popover="auto"
        role="dialog" aria-label={'Chọn giờ · ' + label}
        onToggle={event => {
          const visible = event.currentTarget.matches(':popover-open');
          setOpen(visible);
          if (visible) event.currentTarget.querySelector('select')?.focus({ preventScroll: true });
        }}
        onKeyDown={event => {
          if (event.key !== 'Escape') return;
          event.preventDefault(); event.stopPropagation(); close();
        }}>
        {controls}
        <button type="button" className="button-secondary workspace-time-done" onClick={close}>Xong</button>
      </div>
    </> : controls}
    {name && <input type="hidden" name={name} value={value} disabled={disabled} />}
    {problem && <small className="workspace-date-error" id={id + '-error'} role="alert">{problem}</small>}
  </div>;
}

export function DateTimePicker({ label, name, defaultValue = '', min, max, required, disabled, onChange, error: inputError, withSeconds }: Omit<Field, 'value'> & { withSeconds?: boolean }) {
  const [date, setDate] = useState(defaultValue.slice(0, 10));
  const [parts, setParts] = useState(() => clockParts(defaultValue.slice(11)));
  const [second, setSecond] = useState(defaultValue.slice(17, 19) || '00');
  const [checked, setChecked] = useState(false);
  const clock = parts.every(Boolean) ? parts.join(':') : '';
  const dateTime = (day: string, time: string, seconds = second) => day && time ? day + 'T' + time + (withSeconds ? ':' + seconds : '') : '';
  const isOutsideRange = (value: string) => Boolean(value && ((min && value < min) || (max && value > max)));
  const value = dateTime(date, clock);
  const error = isOutsideRange(value) ? 'Chọn thời điểm trong phạm vi cho phép.' : '';
  const partial = Boolean(date || parts.some(Boolean));
  return <div className="workspace-date-pair" role="group" aria-label={label}>
    <DatePicker label={label + ' · Ngày'} value={date} min={min?.slice(0, 10)} max={max?.slice(0, 10)} required={required || partial} disabled={disabled}
      onChange={next => { setDate(next); onChange?.(dateTime(next, clock)); }} />
    <TimePicker label={label + ' · Giờ'} parts={parts} required={required || partial} disabled={disabled}
      min={date && date === min?.slice(0, 10) ? min.slice(11, 16) : undefined} max={date && date === max?.slice(0, 10) ? max.slice(11, 16) : undefined}
      error={inputError || (checked ? error : undefined)}
      onPartsChange={next => { setParts(next); onChange?.(dateTime(date, next.every(Boolean) ? next.join(':') : '')); }} />
    {withSeconds && <label className="field-label">Giây<select value={second} disabled={disabled} onChange={event => {
      setSecond(event.target.value); onChange?.(dateTime(date, clock, event.target.value));
    }}>
      {Array.from({ length: 60 }, (_, index) => pad(index)).map(option =>
        <option key={option} value={option} disabled={isOutsideRange(dateTime(date, clock, option))}>{option}</option>)}
    </select></label>}
    <FormValue name={name} value={value} disabled={disabled} error={error} onInvalid={() => setChecked(true)} />
  </div>;
}

export function DateRangePicker({ from, to }: { from: Field; to: Field }) {
  return <><DatePicker {...from} max={from.max ?? (to.value || undefined)} /><DatePicker {...to} min={to.min ?? (from.value || undefined)} /></>;
}
