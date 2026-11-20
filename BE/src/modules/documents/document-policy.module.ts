import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DocumentPolicy } from './document-policy.js';
@Module({ imports: [ConfigModule], providers: [DocumentPolicy], exports: [DocumentPolicy] })
export class DocumentPolicyModule {}
