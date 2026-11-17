import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
function load(file) {
  const source = readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: id => load(resolve(dirname(file), id + '.ts')) }, { filename: file });
  return exports;
}

const root = resolve(import.meta.dirname, '../..');
const canonical = load(resolve(root, 'BE/src/modules/stock-movements/item-units.ts')).itemUnits;
for (const [validation, units] of [
  ['FE/src/utils/stock.ts', 'FE/src/utils/item-units.ts'],
  ['mobile/src/stock/validation.ts', 'mobile/src/stock/item-units.ts'],
]) {
  assert.equal(JSON.stringify(load(resolve(root, units)).itemUnits), JSON.stringify(canonical));
  const { stockCompleteInput, stockCreateInput } = load(resolve(root, validation));
  const line = { id: 'line', requestedQty: 4, storedItem: { id: 'item', name: 'Thùng hồ sơ', balance: 5 } };
  const row = { type: 'OUT', lines: [line] };
  for (const value of ['', ' ', '1.5', '-1', 'NaN']) {
    assert.throws(() => stockCompleteInput(row, { line: value }, 'Đã kiểm đếm'));
  }
  assert.throws(() => stockCompleteInput(row, { line: '2' }, ''), /chênh lệch/);
  assert.equal(stockCompleteInput(row, { line: '0' }, 'Khách chưa lấy hàng').lines[0].actualQty, 0);
  assert.equal(stockCompleteInput(row, { line: '4' }, '').lines[0].actualQty, 4);
  assert.throws(() => stockCompleteInput(row, { line: '6' }, 'Yêu cầu thêm'), /tồn/);
  assert.throws(() => stockCompleteInput({ ...row, lines: [line, { ...line, id: 'second' }] }, { line: '4' }, 'Đã đếm'), /thực tế/);
  const fresh = { name: 'Đồ dùng', unit: 'cái', quantity: '2', storedItemId: '', note: '' };
  assert.equal(stockCreateInput('contract', 'IN', [fresh], [], '', '').lines[0].unit, 'cái');
  assert.throws(() => stockCreateInput('contract', 'IN', [{ ...fresh, unit: 'tùy ý' }], [], '', ''), /đơn vị/);
  const legacy = { id: 'old', unit: 'bao tải cũ', balance: 3, rentalContract: { id: 'contract' } };
  assert.equal(stockCreateInput('contract', 'IN', [{ ...fresh, storedItemId: legacy.id }], [legacy], '', '').lines[0].storedItemId, legacy.id);
  console.log('PASS', validation, 'explicit counts, zero, discrepancy, overdraw, multi-line, units and legacy item compatibility');
}
