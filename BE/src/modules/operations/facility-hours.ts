const days = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'];
const shortDays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const allDays = days.map((_, index) => index);
type Mode = 'custom' | 'daily' | 'always';
export type Hours = { start: string; end: string; selected: number[]; mode: Mode };
export const blank: Hours = { start: '', end: '', selected: [], mode: 'custom' };
const normalize = (value: string) => value.trim().toLocaleLowerCase('vi');
const dayIndex = (value: string) => days.findIndex((day, index) => [normalize(day), normalize(shortDays[index])].includes(normalize(value)));

// Accept the format used by the Web WorkingHoursPicker and preserve unparseable legacy strings.
function parseHours(value: string): Hours | null {
  if (!value.trim()) return blank;
  if (value.trim() === '24/7') return { ...blank, mode: 'always' };
  const parts = /^(\d\d:\d\d)\s*[-–—]\s*(\d\d:\d\d)(\s*\(qua nửa đêm\))?(?:\s*[,·]\s*|\s+)(.+)$/i.exec(value.trim());
  if (!parts) return null;
  const [, start, end, overnight, dayText] = parts;
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!clock.test(start) || !(clock.test(end) || end === '24:00') || start === end || (overnight && end >= start)) return null;
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

export type Span = { start: string; end: string };
export type Week = Span[][];
const fullDay = { start: '00:00', end: '24:00' };

export function hourSpans(value: string): Week | null {
  const hours = parseHours(value);
  if (!hours) return null;
  const week: Week = allDays.map(() => []);
  if (hours.mode === 'always') return week.map(() => [fullDay]);
  if (!hours.start) return week;
  for (const day of hours.mode === 'daily' ? allDays : hours.selected) {
    if (hours.end > hours.start) week[day].push({ start: hours.start, end: hours.end });
    else {
      week[day].push({ start: hours.start, end: '24:00' });
      if (hours.end !== '00:00') week[(day + 1) % 7].push({ start: '00:00', end: hours.end });
    }
  }
  return week.map(spans => {
    const [first, second] = spans.sort((a, b) => a.start.localeCompare(b.start));
    return first && second && first.end >= second.start ? [{ start: first.start, end: second.end }] : spans;
  });
}

export const covers = (spans: Span[] | undefined, start: string, end: string) =>
  Boolean(spans?.some(span => span.start <= start && span.end >= end));

export function vietnamLocalTime(at: Date) {
  const local = new Date(+at + 7 * 3_600_000);
  const stamp = local.toISOString();
  return { weekday: local.getUTCDay() || 7, date: stamp.slice(0, 10), time: stamp.slice(11, 16) };
}

export function allowsCustomerAccess(week: Week | null, at: Date) {
  const { weekday, time } = vietnamLocalTime(at);
  return Boolean(week?.[weekday - 1].some(span => span.start <= time && time < span.end));
}

export type ServiceWindow = { weekday: number; starts: string; ends: string; capacity: number };

export function scheduleIssues(office: string, access: string, windows: ServiceWindow[], requireHours = false) {
  const work = hourSpans(office), customer = hourSpans(access);
  const issues: Record<string, string> = {};
  if (!work || (!office.trim() && (requireHours || access.trim() || windows.length))) issues.officeHours = 'Thiết lập giờ làm việc của cơ sở hợp lệ.';
  if (!customer || (!access.trim() && (requireHours || windows.length))) issues.accessHours = 'Thiết lập giờ khách truy cập kho hợp lệ.';
  else if (customer.some((spans, day) => spans.some(span => !covers(work?.[day], span.start, span.end)))) {
    issues.accessHours = 'Giờ khách truy cập kho phải nằm trong giờ làm việc của cơ sở.';
  }
  const outside = windows.find(row => !covers(customer?.[row.weekday - 1], row.starts, row.ends)
    || !covers(work?.[row.weekday - 1], row.starts, row.ends));
  if (outside) issues.serviceSchedule = days[outside.weekday - 1] + ': khung giờ phục vụ ' + outside.starts + '–' + outside.ends
    + ' phải nằm trong giờ khách truy cập kho và giờ làm việc.';
  return issues;
}
