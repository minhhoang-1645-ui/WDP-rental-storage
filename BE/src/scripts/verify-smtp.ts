import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../modules/guest-booking/email.service.js';

async function main() {
  const email = new EmailService(new ConfigService(process.env));
  try {
    await email.verifySmtpConnection();
    console.log('SMTP connection OK');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'SMTP connection failed.');
    process.exitCode = 1;
  }
}

void main();
