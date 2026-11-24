import type { Prisma } from '../../generated/prisma/client.js';

export const disabledSessionPrefix = 'disabled:';

export function activeSessions(now: Date): Prisma.AuthSessionWhereInput {
  return { revokedAt: null, expiresAt: { gt: now }, NOT: { tokenHash: { startsWith: disabledSessionPrefix } } };
}

type RevocationReason = 'ADMIN' | 'ACCOUNT_DISABLED' | 'ROLE_CHANGED' | 'FACILITY_ACCESS_REVOKED' | 'LOGOUT' | 'PASSWORD_CHANGED' | 'PASSWORD_RESET';

export function revokeActiveSessions(
  db: Prisma.TransactionClient,
  where: Prisma.AuthSessionWhereInput,
  reason: RevocationReason,
  actorId?: string,
) {
  const now = new Date();
  return db.authSession.updateMany({
    where: { AND: [where, activeSessions(now)] },
    data: { revokedAt: now, revokedById: actorId ?? null, revocationReason: reason },
  });
}
