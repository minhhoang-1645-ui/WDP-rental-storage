import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const url = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const portal = url(compile(await readFile(new URL('../src/components/manager/portal-data.ts',import.meta.url),'utf8')));
const withPortal = source => source.replace(/from ['"]\.\.\/components\/manager\/portal-data['"]/, `from '${portal}'`);
const incident = url(compile(await readFile(new URL('../src/utils/maintenance-incident.ts',import.meta.url),'utf8')));
const source = withPortal(compile(await readFile(new URL('../src/utils/record-identity.ts',import.meta.url),'utf8')))
  .replace(/from ['"]\.\/maintenance-incident['"]/, `from '${incident}'`);
const { newestFirst, isJustCreated, recordIdentity } = await import(url(source));
const { physicalUnitCodes, physicalUnitLabel } = await import(url(withPortal(compile(await readFile(new URL('../src/utils/physical-units.ts', import.meta.url), 'utf8')))));
const records = [{id:'old',createdAt:'2026-01-01T00:00:00Z'},{id:'missing'},{id:'new',createdAt:'2026-11-10T01:02:03Z'}];
assert.deepEqual(newestFirst(records).map(row=>row.id),['new','old','missing']);
assert.equal(records[0].id,'old','Sorting must not mutate API data');
const now=Date.parse('2026-11-10T01:10:00Z');
assert(isJustCreated(records[2],'new',now));
assert(!isJustCreated(records[2],'old',now));
assert(!isJustCreated(records[0],'old',now));
assert(!isJustCreated(records[1],'missing',now));
assert(!isJustCreated(records[2],'new',Date.parse('2026-11-10T01:00:00Z')));
const unallocated=recordIdentity({product:{name:'Tủ lưu trữ',code:'TYPE-A01'},quantity:2},'reservations');
assert.equal(unallocated.location,'','A StorageType code must never become a physical unit');
assert.equal(unallocated.quantity,'2 kho');
assert.equal(unallocated.created,'','No fabricated creation timestamp');
assert.equal(recordIdentity({storageType:{name:'Kho nhỏ'},allocatedUnits:[{unitCode:'REAL-001'}]},'appointments').location,'REAL-001');
assert.equal(recordIdentity({type:'IN',storageUnit:{unitNumber:'OLD-001'},currentStorageUnit:{unitNumber:'NEW-002'}},'stock-movements').location,'NEW-002','Current goods location must not be merged with the historical movement location');
assert.deepEqual(physicalUnitCodes({ reference: 'RES-123', product: { code: 'TYPE-01' } }, 'reservations'), []);
assert.deepEqual(physicalUnitCodes({ allocatedUnits: [{ unitNumber: 'LG-03' }, { unitCode: 'SM-02' }, { unitNumber: 'LG-03' }] }, 'reservations'), ['LG-03', 'SM-02']);
const handover = { status: 'COMPLETED', allocatedUnits: [{ unitCode: 'NEW-01' }] };
assert.deepEqual(physicalUnitCodes(handover, 'appointments'), []);
assert.deepEqual(physicalUnitCodes({ ...handover, handoverReport: { unitChecks: [{ unitCode: 'OLD-01' }] } }, 'appointments'), ['OLD-01']);
assert.deepEqual(physicalUnitCodes({ status: 'COMPLETED', contracts: [{ unitCode: 'NEW-01' }],
  appendix: { snapshot: { contracts: [{ unitCode: 'OLD-01' }] } } }, 'renewals'), ['OLD-01']);
assert.equal(physicalUnitLabel({ fromUnit: { unitCode: 'LG-03', facility: { id: 'a', name: 'Cơ sở A' } },
  toUnit: { unitNumber: 'MD-02', facility: { id: 'b', name: 'Cơ sở B' } } }, 'transfers'), 'LG-03 · Cơ sở A → MD-02 · Cơ sở B');
assert.equal(physicalUnitLabel({ fromUnit: { unitCode: 'LG-03' }, reservation: { reference: 'RES-123' } }, 'transfers'), 'LG-03 → Chưa chọn kho đích');
assert.equal(physicalUnitLabel({ unitCodeSnapshot: 'MD-01', unit: { unitCode: 'NEW-01' } }, 'damage-claims'), 'MD-01');
console.log('PASS identity helpers: actual dates, stable non-mutating sort, exact created ID/time window, absent data, StorageType vs physical StorageUnit.');
