import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class HealthService {
  private pendingDatabaseCheck?: Promise<void>;
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async readiness() {
    // Sessions and pending signature OTPs are local to this process. Do not claim
    // readiness for a deployment explicitly configured with several replicas.
    for (const key of ['APP_INSTANCE_COUNT', 'WEB_CONCURRENCY']) {
      const value = this.config.get<string>(key);
      if (value !== undefined && value !== '' && (!/^\d+$/.test(value) || Number(value) !== 1)) throw this.unavailable();
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!this.pendingDatabaseCheck) {
        const query = this.prisma.$queryRaw`SELECT 1`.then(() => undefined);
        this.pendingDatabaseCheck = query;
        // Repeated probes share one DB request even if the DB connection stalls.
        void query.then(() => { if (this.pendingDatabaseCheck === query) this.pendingDatabaseCheck = undefined; }, () => { if (this.pendingDatabaseCheck === query) this.pendingDatabaseCheck = undefined; });
      }
      await Promise.race([
        this.pendingDatabaseCheck,
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(this.unavailable()), 2000); }),
      ]);
      return { status: 'ready', service: 'wdp-storage-api', runtime: 'single-instance', database: 'reachable', timestamp: new Date().toISOString() };
    } catch { throw this.unavailable(); }
    finally { clearTimeout(timer); }
  }

  private unavailable() { return new ServiceUnavailableException({ status: 'not_ready', service: 'wdp-storage-api', message: 'Dịch vụ chưa sẵn sàng.' }); }
}
