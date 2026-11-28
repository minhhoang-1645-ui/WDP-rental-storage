import { PayOS } from '@payos/node';
import { ConfigService } from '@nestjs/config';
import { expect, it } from 'vitest';
import { PayosService } from './payos.service.js';
import { PayosPaymentService } from './payos-payment.service.js';

it('awaits the official SDK signature verifier and ignores the signed registration sample', async () => {
  const checksumKey = 'isolated-fixture-checksum';
  const sdk = new PayOS({ clientId: 'fixture', apiKey: 'fixture', checksumKey });
  const provider = new PayosService(new ConfigService({
    PAYOS_CLIENT_ID: 'fixture', PAYOS_API_KEY: 'fixture', PAYOS_CHECKSUM_KEY: checksumKey,
  }, { skipProcessEnv: true }));
  const service = new PayosPaymentService({} as never, provider, {} as never);
  const data = {
    orderCode: 123, amount: 3000, description: 'VQRIO123', accountNumber: '12345678', reference: 'TF230204212323',
    transactionDateTime: '2023-02-04 18:25:00', currency: 'VND', paymentLinkId: '124c33293c43417ab7879e14c8d9eb18',
    code: '00', desc: 'success',
  };
  const signature = (await sdk.crypto.createSignatureFromObj(data, checksumKey))!;
  const body = { code: '00', desc: 'success', success: true, data, signature };
  await expect(service.webhook(body)).resolves.toEqual({ success: true });
  await expect(service.webhook({ ...body, data: { ...data, amount: 3001 } })).rejects.toMatchObject({ status: 400 });
});

it('keeps cutover active when creation is disabled and reports missing configuration by name', () => {
  const provider = new PayosService(new ConfigService({ PAYOS_CUTOVER: 'true', PAYOS_ENABLED: 'false' }, { skipProcessEnv: true }));
  expect(provider.cutover).toBe(true);
  expect(provider.enabled).toBe(false);
  expect(() => provider.assertConfigured()).toThrow('PAYOS_CHECKSUM_KEY');
});
