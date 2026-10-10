import 'dotenv/config';
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import type { UserRole } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const scryptAsync = promisify(scrypt);

const testUsers: Array<{ email: string; fullName: string; phone: string; role: UserRole }> = [
  { email: 'customer@test.com', fullName: 'WDP Test Customer', phone: '0900000001', role: 'CUSTOMER' },
  { email: 'staff@test.com', fullName: 'WDP Test Staff', phone: '0900000002', role: 'STAFF' },
  { email: 'manager@test.com', fullName: 'WDP Test Manager', phone: '0900000003', role: 'MANAGER' },
  { email: 'admin@test.com', fullName: 'WDP Test Admin', phone: '0900000004', role: 'ADMIN' },
];

async function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await scryptAsync(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${key.toString('hex')}`;
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Test-user seeding is disabled in production.');
  const password = process.env.SEED_TEST_USERS_PASSWORD;
  if (!password || password.length < 12 || password.length > 128) {
    throw new Error('Set SEED_TEST_USERS_PASSWORD to a 12-128 character development password.');
  }

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    for (const user of testUsers) {
      const hash = await passwordHash(password);
      await prisma.user.upsert({
        where: { email: user.email },
        update: { fullName: user.fullName, phone: user.phone, role: user.role, passwordHash: hash },
        create: { ...user, passwordHash: hash },
      });
    }
    console.log(`Test users ready: ${testUsers.map((user) => `${user.email} (${user.role})`).join(', ')}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Test-user seed failed.');
  process.exitCode = 1;
});
