import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    const connectionString = process.env.DATABASE_URL;
    super({ adapter: new PrismaPg({ connectionString }) });
  }
  async onModuleInit() {
    if (process.env.DATABASE_CONNECT_ON_STARTUP !== 'false') await this.$connect();
  }
  async onModuleDestroy() { await this.$disconnect(); }
}
