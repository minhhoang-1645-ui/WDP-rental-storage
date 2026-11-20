import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

for (const path of ['../src/utils/handover.ts', '../../mobile/src/utils/handover.ts']) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  const { handoverCompletionIssue: issue } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const contracts = [{ contractStartDate: '2026-11-19', contractEndDate: '2026-12-19' }];
  const planned = '2026-11-16T16:18:00+07:00';
  assert.equal(issue(planned, Date.parse('2026-11-16T08:00:00+07:00'), contracts), '', 'Allow earlier actual collection inside pickup window');
  assert.match(issue(planned, Date.parse('2026-11-15T23:59:00+07:00'), contracts), /3 ngày/, 'Keep three-day limit');
  assert.equal(issue(planned, Date.parse('2026-11-19T08:00:00+07:00'), contracts), '');
  assert.match(issue(planned, Date.parse('2026-12-19T00:00:00+07:00'), contracts), /kết thúc/, 'End date is exclusive');
  assert.match(issue('invalid', Date.now(), contracts), /hợp lệ/);
  console.log(`PASS ${path}: actual collection window independent of planned hour`);
}
