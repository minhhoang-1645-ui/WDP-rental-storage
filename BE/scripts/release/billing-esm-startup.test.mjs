import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('compiled ESM initializes billing providers and their Nest injection metadata', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    import 'reflect-metadata';
    const { BillingService } = await import('./dist/modules/billing/billing.service.js');
    const { PayosPaymentService } = await import('./dist/modules/billing/payos-payment.service.js');
    const { BillingModule } = await import('./dist/modules/billing/billing.module.js');
    assert.equal(Reflect.getMetadata('design:paramtypes', PayosPaymentService)[2], BillingService);
    const providers = Reflect.getMetadata('providers', BillingModule);
    assert.equal(providers.filter(provider => provider === BillingService).length, 1);
    assert.ok(providers.includes(PayosPaymentService));
  `], { cwd: new URL('../../', import.meta.url), encoding: 'utf8', timeout: 10_000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});
