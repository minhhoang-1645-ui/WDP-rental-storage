import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { EmailService } from '../modules/guest-booking/email.service.js';

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('EMAIL_TEST_SCRIPT_DISABLED_IN_PRODUCTION');
  const recipient = process.env.EMAIL_TEST_RECIPIENT?.trim() ?? '';
  if (!/^\S+@\S+\.\S+$/.test(recipient)) throw new Error('EMAIL_TEST_RECIPIENT must be a valid test recipient.');

  const email = new EmailService(new ConfigService(process.env));
  email.onModuleInit();
  const result = await email.sendBookingClaim({
    to: recipient,
    fullName: 'WDP Email Test',
    bookingCode: `WDP-EMAIL-TEST-${Date.now()}`,
    storageName: 'Kho kiểm thử email',
    startDate: '2026-11-01',
    endDate: '2026-12-01',
    rentalAmount: 1000000,
    discountAmount: 0,
    depositAmount: 500000,
    initialAmountDue: 1500000,
    quantity: 1,
    paymentPlan: 'PAY_MONTHLY',
    claimToken: randomBytes(32).toString('base64url'),
  });
  console.log(`Test email accepted by ${result.adapter} adapter.`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Test email failed.');
  process.exitCode = 1;
});
