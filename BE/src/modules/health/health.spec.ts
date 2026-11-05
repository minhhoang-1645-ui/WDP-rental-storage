import { describe, expect, it, vi, afterEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service.js';

afterEach(() => vi.useRealTimers());
describe('Readiness checks without database access', () => {
  it('runs a read-only DB probe and describes the supported single-instance mode', async () => {
    const db = { $queryRaw: vi.fn().mockResolvedValue([{ value: 1 }]) };
    const result = await new HealthService(db as never, new ConfigService()).readiness();
    expect(result).toMatchObject({ status: 'ready', runtime: 'single-instance', database: 'reachable' });
    expect(db.$queryRaw).toHaveBeenCalledOnce(); expect([...db.$queryRaw.mock.calls[0][0]]).toEqual(['SELECT 1']);
  });
  it.each([{ APP_INSTANCE_COUNT: '2' }, { WEB_CONCURRENCY: '4' }, { APP_INSTANCE_COUNT: 'invalid' }])('does not advertise local session/OTP memory as multi-instance ready: %j', async values => {
    const db = { $queryRaw: vi.fn() };
    await expect(new HealthService(db as never, new ConfigService(values)).readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
  it('does not expose database errors or credentials', async () => {
    const db = { $queryRaw: vi.fn().mockRejectedValue(new Error('postgres://private-password@db/internal-schema')) };
    const error = await new HealthService(db as never, new ConfigService()).readiness().catch(error => error);
    expect(error.getStatus()).toBe(503); expect(JSON.stringify(error.getResponse())).not.toMatch(/private-password|postgres|internal-schema/);
  });
  it('bounds stalled probes and shares the same in-flight DB request', async () => {
    vi.useFakeTimers();
    const db = { $queryRaw: vi.fn().mockReturnValue(new Promise(() => {})) }, service = new HealthService(db as never, new ConfigService());
    const first = service.readiness().catch(error => error), second = service.readiness().catch(error => error);
    await vi.advanceTimersByTimeAsync(2000);
    for (const result of await Promise.all([first, second])) expect(result.getStatus()).toBe(503);
    expect(db.$queryRaw).toHaveBeenCalledOnce();
    const next = service.readiness().catch(error => error); await vi.advanceTimersByTimeAsync(2000);
    expect((await next).getStatus()).toBe(503); expect(db.$queryRaw).toHaveBeenCalledOnce();
  });
});
