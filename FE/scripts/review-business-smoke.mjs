// Pure calculations: no server, credentials or database writes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function load(path) {
  return import(await moduleUrl(new URL(path, import.meta.url)));
}
async function moduleUrl(file) {
  let output = ts.transpileModule(await readFile(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const match of [...output.matchAll(/from ['"]([^'"]+)['"]/g)]) {
    const resolved = match[1].startsWith('@/') ? new URL(`../../mobile/src/${match[1].slice(2)}.ts`, import.meta.url) : new URL(match[1] + '.ts', file);
    output = output.replace(match[0], `from '${await moduleUrl(resolved)}'`);
  }
  return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
}
const { reportDay, reportRange, buildReport, reportMoney } = await load('../src/utils/reporting.ts');
assert.equal(await readFile(new URL('../src/utils/reporting.ts', import.meta.url), 'utf8'), await readFile(new URL('../../mobile/src/utils/reporting.ts', import.meta.url), 'utf8'));
assert.equal(reportDay('2026-11-09T17:00:00Z'), '2026-11-10');
assert.equal(reportDay('2026-11-09T16:59:59Z'), '2026-11-09');
assert.equal(reportDay('not a date'), '');
assert.deepEqual(reportRange('week', '2027-01-01'), { from: '2026-12-28', to: '2027-01-03' });
assert.deepEqual(reportRange('month', '2028-02-12'), { from: '2028-02-01', to: '2028-02-29' });
assert.deepEqual(reportRange('year', '2026-11-10'), { from: '2026-01-01', to: '2026-12-31' });
const small = { id: 'small', name: 'Kho nhỏ' }, large = { id: 'large', name: 'Kho lớn' };
const invoice = (id, type, issuedAt, extra = {}) => ({ id, reservation: { storageType: type }, status: 'OPEN', rentalAmount: 1500000, depositAmount: 1500000, totalAmount: 3000000, amountPaid: 1000000, balanceDue: 2000000, issuedAt, ...extra });
const invoices = [invoice('a', small, '2026-11-09T17:00:00Z'), invoice('old', small, '2026-10-01T00:00:00Z'), invoice('void', small, '2026-11-10T00:00:00Z', { status: 'VOID' }), invoice('other', large, '2026-11-10T00:00:00Z'), invoice('tomorrow', small, '2026-11-10T17:00:00Z')];
const payments = [{ amount: 1000000, invoice: { id: 'a' }, receivedAt: '2026-11-10T01:00:00Z' }, { amount: 250000, invoice: { id: 'old' }, receivedAt: '2026-11-10T16:59:59Z' }, { amount: 777, invoice: { id: 'other' }, receivedAt: '2026-11-10T01:00:00Z' }];
const reservations = [{ product: small, createdAt: '2026-11-10T00:00:00Z', status: 'CONFIRMED', quantity: 3 }, { product: small, createdAt: '2026-11-10T00:00:00Z', status: 'CANCELLED', quantity: 1 }];
const options = { from: '2026-11-10', to: '2026-11-10', group: 'day', typeId: 'small' };
const report = buildReport(invoices, payments, reservations, options);
assert.deepEqual(report.invoices.map(row => row.id), ['a']);
assert.equal(report.voidCount, 1);
assert.equal(report.rent, 1500000, 'Rent excludes deposit and unissued future rent');
assert.equal(report.deposit, 1500000);
assert.equal(report.total, 3000000);
assert.equal(report.debt, 2000000);
assert.equal(report.received, 1250000, 'A payment for an older invoice counts by payment date and original invoice type');
assert.deepEqual(report.categories[0], { id: 'small', name: 'Kho nhỏ', requests: 2, confirmed: 1, units: 4, rent: 1500000 });
assert.deepEqual(report.times, [{ date: '2026-11-10', rent: 1500000, received: 1250000, bookings: 2 }]);
assert.equal(buildReport(invoices, payments, reservations, { ...options, group: 'week' }).times[0].date, '2026-11-09');
const incomplete = buildReport([invoice('bad', small, '2026-11-10T00:00:00Z', { rentalAmount: undefined })], [{ amount: 'bad', receivedAt: '2026-11-10T00:00:00Z' }], [], { ...options, typeId: '' });
assert.equal(incomplete.missingAmounts, 1);
assert.equal(incomplete.missingPayments, 1);
assert.equal(reportMoney(incomplete.rent), 'Chưa đủ số liệu', 'Never silently report missing money as zero');
assert.equal(reportMoney(incomplete.received), 'Chưa đủ số liệu');
const { stockUnitOptions, stockUnits, storedLocation } = await load('../src/utils/stock-units.ts');
assert.equal(stockUnitOptions.length, new Set(stockUnits).size);
assert.equal(storedLocation({ storageUnit: { unitNumber: 'B12-01', floor: 'Ground', zone: 'B12' } }), 'B12-01 · Tầng trệt · Khu B12');
assert.match(storedLocation({}), /Chưa tải/);
const { serviceRateUnit } = await load('../src/utils/service-labels.ts');
assert.match(serviceRateUnit({ kind: 'PURCHASE', billingUnit: 'ONE_TIME' }), /mua một lần/);
assert.equal(serviceRateUnit({ kind: 'RENTAL', billingUnit: 'DAY' }), 'thiết bị / ngày');
assert.equal(serviceRateUnit({ kind: 'RENTAL', billingUnit: 'MONTH' }), 'thiết bị / tháng lịch');
assert.match(serviceRateUnit({ kind: 'RENTAL', billingUnit: '?' }), /Chưa xác định/);
const { reportPie, piePercent } = await load('../src/utils/report-pie.ts');
assert.equal(await readFile(new URL('../src/utils/report-pie.ts', import.meta.url), 'utf8'), await readFile(new URL('../../mobile/src/utils/report-pie.ts', import.meta.url), 'utf8'));
const pie = reportPie([{ id: 'small', label: 'Kho nhỏ', value: 2 }, { id: 'large', label: 'Kho lớn', value: 1 }]);
assert.equal(pie.total, 3); assert.equal(pie.slices[0].percent, '66,7%'); assert.equal(pie.slices[1].percent, '33,3%');
assert.equal(pie.slices.reduce((sum, item) => sum + item.value, 0), pie.total);
assert(Math.abs(pie.slices.reduce((sum, item) => sum + item.fraction, 0) - 1) < 1e-12);
assert.equal(reportPie([]).slices.length, 0);
assert.equal(reportPie([{ id: 'empty', label: 'Rỗng', value: 0 }]).slices.length, 0);
assert.equal(reportPie([{ id: 'bad', label: 'Thiếu', value: Number.NaN }]).valid, false);
assert.equal(reportPie([{ id: 'bad', label: 'Âm', value: -1 }]).valid, false);
assert.equal(reportPie([{ id: 'only', label: 'Một loại', value: 1500000 }]).slices[0].percent, '100%');
assert.equal(piePercent(0.01), '<0,1%');
const manyPie = reportPie(Array.from({ length: 10 }, (_, i) => ({ id: String(i), label: 'Loại ' + i, value: i + 1 })));
assert.equal(manyPie.total, 55); assert.equal(manyPie.slices.length, 6); assert.equal(manyPie.slices.at(-1).value, 15);
for (const path of ['../src/utils/stock.ts', '../../mobile/src/stock/validation.ts']) {
  const { stockCreateInput } = await load(path);
  const line = { key: 'line', name: 'Hồ sơ', unit: 'thùng', quantity: '2', storedItemId: '', note: '' };
  assert.equal(stockCreateInput('contract', 'IN', [line], [], '', '').lines[0].unit, 'thùng');
  assert.throws(() => stockCreateInput('contract', 'IN', [{ ...line, unit: 'đơn vị tự gõ' }], [], '', ''));
  const oldItem = { id: 'legacy', unit: 'sọt', name: 'Hàng đã lưu', balance: 4, rentalContract: { id: 'contract' } };
  assert.equal(stockCreateInput('contract', 'OUT', [{ ...line, storedItemId: 'legacy', unit: '' }], [oldItem], '', '').lines[0].storedItemId, 'legacy', 'Existing units are preserved and can still be withdrawn');
  assert.throws(() => stockCreateInput('another-contract', 'OUT', [{ ...line, storedItemId: 'legacy' }], [oldItem], '', ''), /không thuộc/);
}
console.log('PASS: Vietnam dates, day/week/month/year ranges, invoice vs cash/type joins, VOID exclusion, bookings vs units, incomplete amounts, warehouse location and service units.');
