/** The facility's calendar day. Prisma @db.Date values remain UTC date-only values. */
export const businessDate = (now = new Date()) => new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
export const businessToday = (now = new Date()) => new Date(businessDate(now) + 'T00:00:00.000Z');
