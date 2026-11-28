import { apiRequest } from '../services/api';

type Cell = string | number | null;
export type ReportSheet = { name: string; headers: string[]; rows: Cell[][]; moneyColumns?: number[]; filter?: boolean };
type ReportContext = { title: string; scope: string; period: string; invoiceScope?: string };
const moneyFormat = '#,##0" ₫";-#,##0" ₫";0" ₫"';
const exportedAt = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'medium',
});

// The existing export endpoints quote every field and use CRLF record separators.
export function parseReportCsv(csv: string): string[][] {
  const source = csv.replace(/^\uFEFF/, '');
  const tokens = /"((?:[^"]|"")*)"([,]|\r?\n|$)/gy;
  const result: string[][] = [];
  let row: string[] = [];
  while (tokens.lastIndex < source.length) {
    const match = tokens.exec(source);
    if (!match) throw new Error('Dữ liệu hóa đơn xuất ra không đúng định dạng.');
    row.push(match[1].replaceAll('""', '"'));
    if (match[2] !== ',') {
      result.push(row);
      row = [];
    }
  }
  if (row.length || !result.length || result.some(record => record.length !== result[0].length)) {
    throw new Error('Dữ liệu hóa đơn xuất ra không đủ cột.');
  }
  return result;
}

export function excelMoney(value: unknown, location?: string): number | null {
  if (value == null) return null;
  // Check the decimal part before converting to Number, since conversion can hide tiny fractions.
  const integer = typeof value === 'string' ? /^([+-]?\d+)(?:\.0+)?$/.exec(value)?.[1] : undefined;
  const amount = typeof value === 'bigint' || typeof value === 'number' ? Number(value)
    : integer === undefined ? NaN : Number(integer);
  if (!Number.isSafeInteger(amount) || Math.abs(amount) >= 1e15) {
    const message = 'Có số tiền vượt độ chính xác hỗ trợ của Excel hoặc không hợp lệ.';
    throw new Error(location ? `${message} ${location}` : message);
  }
  return amount;
}

function invoiceCsvMoney(value: string, location: string) {
  if (value === '') return null;
  // The CSV endpoint JSON-serializes BigInt as a quoted string before applying CSV escaping.
  const raw = /^"([+-]?\d+(?:\.\d+)?)"$/.exec(value)?.[1] ?? value.replace(/^'(?=[+-]\d)/, '');
  return excelMoney(raw, location);
}

export async function reportInvoiceSheet(path: string): Promise<ReportSheet> {
  const blob = await apiRequest<Blob>(path, { responseType: 'blob' });
  const [headers, ...records] = parseReportCsv(await blob.text());
  const isMoney = headers.map(header => header.endsWith(' VND'));
  const moneyColumns = isMoney.flatMap((value, index) => value ? [index + 1] : []);
  if (!moneyColumns.length || headers[0] !== 'Mã hóa đơn') throw new Error('Thiếu các cột hóa đơn cần xuất.');
  const rows = records.map((record, rowIndex) => record.map((value, index) => isMoney[index]
    ? invoiceCsvMoney(value, `Sheet Danh sách hóa đơn, dòng ${rowIndex + 7}, cột ${index + 1} (${headers[index]}).`)
    : value.replace(/^'(?=[=+@\-\t\r])/, '')));
  return { name: 'Danh sách hóa đơn', headers, rows, moneyColumns, filter: true };
}

export async function createReportWorkbook(context: ReportContext, sheets: ReportSheet[]) {
  const { Workbook } = (await import('exceljs')).default;
  const workbook = new Workbook();
  workbook.creator = 'NestBox';
  const timestamp = exportedAt.format(new Date()) + ' (UTC+7)';
  for (const { name, headers, rows, moneyColumns = [], filter } of sheets) {
    const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 6 }] });
    sheet.mergeCells(1, 1, 1, headers.length);
    const title = sheet.getCell('A1');
    title.value = context.title;
    title.font = { name: 'Calibri', bold: true, size: 16, color: { argb: 'FF243BC9' } };
    sheet.getRow(1).height = 24;
    const scope = filter && context.invoiceScope ? context.invoiceScope : context.scope;
    for (const [index, value] of [scope, context.period, timestamp].entries()) {
      const row = index + 2;
      sheet.getCell(row, 1).value = ['Phạm vi', 'Kỳ báo cáo', 'Thời điểm xuất'][index];
      sheet.getCell(row, 1).font = { bold: true };
      if (headers.length > 2) sheet.mergeCells(row, 2, row, headers.length);
      sheet.getCell(row, 2).value = value;
    }
    const header = sheet.getRow(6);
    header.values = headers;
    header.height = 26;
    header.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3149E8' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    // Only scalar string/number cells are written. Excel formulas require an explicit formula object.
    sheet.addRows(rows);
    headers.forEach((label, index) => {
      const column = sheet.getColumn(index + 1);
      const wrap = label === 'Định nghĩa';
      const contentWidth = rows.reduce((width, row) => Math.max(width, String(row[index] ?? '').length), label.length);
      column.width = wrap ? 64 : Math.min(44, Math.max(moneyColumns.includes(index + 1) ? 19 : 15, contentWidth + 3));
      for (let row = 7; row < 7 + rows.length; row++) {
        const cell = sheet.getCell(row, index + 1);
        if (wrap) cell.alignment = { wrapText: true, vertical: 'top' };
        if (moneyColumns.includes(index + 1)) {
          cell.numFmt = moneyFormat;
          cell.alignment = { horizontal: 'right' };
        }
        if (label === 'Tỷ lệ sử dụng kho' && typeof cell.value === 'number') cell.numFmt = '0.0%';
        if (wrap) sheet.getRow(row).height = 32;
      }
    });
    if (filter) sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6 + rows.length, column: headers.length } };
  }
  return workbook;
}

export async function downloadReportWorkbook(filename: string, context: ReportContext, sheets: ReportSheet[]) {
  const workbook = await createReportWorkbook(context, sheets);
  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(buffer);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename + '.xlsx';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
