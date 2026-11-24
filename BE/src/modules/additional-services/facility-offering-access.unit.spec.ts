import { describe, expect, it, vi } from 'vitest';
import { AdditionalServicesService } from './additional-services.service.js';
import type { PublicUser } from '../auth/auth.types.js';

describe('Manager shared catalog boundary', () => {
  it('requires existing shared catalog definitions for facility offerings', async () => {
    const create = vi.fn();
    const service = new AdditionalServicesService({ additionalService: { create } } as never);
    await expect(service.create({ code: 'NEW' }, { id: 'manager', role: 'FACILITY_MANAGER' } as PublicUser)).rejects.toThrow('Chỉ điều hành kinh doanh');
    expect(create).not.toHaveBeenCalled();
  });
});
