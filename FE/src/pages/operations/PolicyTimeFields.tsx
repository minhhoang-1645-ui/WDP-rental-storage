import { useState } from 'react';

const units = { minutes: { factor: 1, label: 'Phút' }, hours: { factor: 60, label: 'Giờ' }, days: { factor: 1440, label: 'Ngày' } };
type Unit = keyof typeof units;
const integer = new Intl.NumberFormat('vi-VN');

export function durationMinutes(input: string, unit: string) {
  if (!Object.hasOwn(units, unit)) return NaN;
  const value = input.trim().replace(',', '.');
  const fraction = /^(\d{1,16})\/(\d{1,16})$/.exec(value);
  const decimal = /^(\d{1,16})(?:\.(\d{1,16}))?$/.exec(value);
  if (!fraction && !decimal) return NaN;
  const denominator = fraction ? BigInt(fraction[2]) : 10n ** BigInt(decimal?.[2]?.length ?? 0);
  const numerator = fraction ? BigInt(fraction[1]) : BigInt((decimal?.[1] ?? '') + (decimal?.[2] ?? ''));
  const minutes = numerator * BigInt(units[unit as Unit].factor);
  if (!denominator || minutes % denominator !== 0n) return NaN;
  const result = Number(minutes / denominator);
  return Number.isSafeInteger(result) ? result : NaN;
}

function displayDuration(minutes: number, unit: Unit) {
  const factor = units[unit].factor;
  const value = String(minutes / factor).replace('.', ',');
  return durationMinutes(value, unit) === minutes ? value : minutes + '/' + factor;
}

export function DurationField({ minutes, min, max, error }: { minutes: number; min: number; max: number; error?: string }) {
  const initial: Unit = minutes >= 60 && minutes % 60 === 0 ? 'hours' : 'minutes';
  const [unit, setUnit] = useState<Unit>(initial);
  const [value, setValue] = useState(displayDuration(minutes, initial));
  const parsed = durationMinutes(value, unit);
  return <div className="policy-duration">
    <div className="policy-field-grid">
      <label className="policy-field">Thời gian giữ đơn
        <input name="value" value={value} required onChange={event => setValue(event.target.value)}
          aria-invalid={Boolean(error)} aria-describedby="policy-duration-help" />
      </label>
      <label className="policy-field">Đơn vị
        <select name="durationUnit" aria-label="Đơn vị thời gian giữ đơn" value={unit} onChange={event => {
          const next = event.target.value as Unit;
          if (Number.isFinite(parsed)) setValue(displayDuration(parsed, next));
          setUnit(next);
        }}>
          {Object.entries(units).map(([key, option]) => <option key={key} value={key}>{option.label}</option>)}
        </select>
      </label>
    </div>
    <small id="policy-duration-help" className={error ? 'policy-field-error' : 'policy-muted'}>{error ||
      (Number.isFinite(parsed) ? 'Tương đương ' + integer.format(parsed) + ' phút. ' : '') +
      'Phạm vi ' + integer.format(min) + '–' + integer.format(max) + ' phút.'}</small>
  </div>;
}


