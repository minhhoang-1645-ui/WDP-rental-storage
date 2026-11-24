import { describe, expect, it, vi } from 'vitest';
import { assertNoOpenAssignments } from '../facility-access/facility-access.service.js';

describe('Account and facility access changes honor current assignments', () => {
  it('ignores ancient stock assignments while still blocking valid open work', async () => {
    const db = {
      stockMovement: { count: vi.fn().mockResolvedValue(3) },
      handoverAppointment: { count: vi.fn().mockResolvedValue(0) },
      maintenanceRequest: { count: vi.fn().mockResolvedValue(0) },
      returnRequest: { count: vi.fn().mockResolvedValue(0) },
      supportRequest: { count: vi.fn().mockResolvedValue(0) },
      transferRequest: { count: vi.fn().mockResolvedValue(0) },
      damageClaim: { count: vi.fn().mockResolvedValue(0) },
    };
    await expect(assertNoOpenAssignments(db as never, 'staff')).resolves.toBeUndefined();
    expect(db.stockMovement.count).not.toHaveBeenCalled();
    db.returnRequest.count.mockResolvedValue(1);
    await expect(assertNoOpenAssignments(db as never, 'staff')).rejects.toThrow('công việc chưa hoàn tất');
  });
});
