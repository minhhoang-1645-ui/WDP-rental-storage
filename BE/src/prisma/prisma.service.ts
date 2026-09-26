import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/wdp_storage';
    super({ adapter: new PrismaPg({ connectionString }) });
  }
  async onModuleInit() {
    if (process.env.DATABASE_CONNECT_ON_STARTUP === 'true') await this.$connect();
  }
  async onModuleDestroy() { await this.$disconnect(); }
}
