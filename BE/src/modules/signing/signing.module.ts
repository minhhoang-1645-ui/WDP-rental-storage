import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailService } from '../guest-booking/email.service.js';
import { SigningOtpService } from './signing-otp.service.js';

@Module({ imports: [ConfigModule], providers: [EmailService, SigningOtpService], exports: [SigningOtpService] })
export class SigningModule {}
