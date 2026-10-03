import 'dotenv/config';
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { storageListings, storageSizes } from '../modules/storage/storage.catalog.js';
import { PrismaService } from '../prisma/prisma.service.js';

const scryptAsync = promisify(scrypt);
const facilityId = 'wdp-main-facility';

async function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await scryptAsync(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${key.toString('hex')}`;
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    await prisma.facility.upsert({
      where: { code: 'WDP-MAIN' },
      update: { name: 'WDP Storage', address: 'Cơ sở WDP hiện tại' },
      create: { id: facilityId, code: 'WDP-MAIN', name: 'WDP Storage', address: 'Cơ sở WDP hiện tại' },
    });

    for (const product of storageListings) {
      const size = storageSizes.find((candidate) => candidate.id === product.sizeId);
      if (!size) throw new Error(`Missing size definition for ${product.id}`);
      const dimensions = size.dimensions.match(/[\d,]+/g)?.map((value) => Math.round(Number(value.replace(',', '.')) * 100));
      if (!dimensions || dimensions.length !== 3) throw new Error(`Invalid dimensions for ${product.id}`);
      await prisma.storageType.upsert({
        where: { id: product.id },
        update: {
          facilityId,
          code: product.code,
          name: product.name,
          sizeId: product.sizeId,
          sizeName: size.name,
          kicker: size.kicker,
          condition: product.condition === 'climate' ? 'AIR_CONDITIONED' : 'STANDARD',
          catalogStatus: product.status === 'limited' ? 'LIMITED' : 'AVAILABLE',
          widthCm: dimensions[0]!,
          lengthCm: dimensions[1]!,
          heightCm: dimensions[2]!,
          roomEquivalent: size.roomEquivalent,
          capacity: size.capacity,
          boxCount: size.boxCount,
          suitableItems: size.suitableItems,
          image: product.image,
          imageAlt: `Ảnh minh họa cho ${product.name}`,
          floor: product.floor,
          access: product.access,
          features: product.features,
          monthlyRate: product.monthlyPrice,
          depositMonths: product.depositMonths,
        },
        create: {
          id: product.id,
          facilityId,
          code: product.code,
          name: product.name,
          sizeId: product.sizeId,
          sizeName: size.name,
          kicker: size.kicker,
          condition: product.condition === 'climate' ? 'AIR_CONDITIONED' : 'STANDARD',
          catalogStatus: product.status === 'limited' ? 'LIMITED' : 'AVAILABLE',
          widthCm: dimensions[0]!,
          lengthCm: dimensions[1]!,
          heightCm: dimensions[2]!,
          roomEquivalent: size.roomEquivalent,
          capacity: size.capacity,
          boxCount: size.boxCount,
          suitableItems: size.suitableItems,
          image: product.image,
          imageAlt: `Ảnh minh họa cho ${product.name}`,
          floor: product.floor,
          access: product.access,
          features: product.features,
          monthlyRate: product.monthlyPrice,
          depositMonths: product.depositMonths,
        },
      });

      for (let index = 1; index <= 5; index += 1) {
        const unitNumber = `${product.code}-${String(index).padStart(3, '0')}`;
        const initialStatus = product.id === 'sm-c08' && index === 1
          ? 'OCCUPIED'
          : product.id === 'lg-f02' && index === 1
            ? 'MAINTENANCE'
            : 'AVAILABLE';
        await prisma.storageUnit.upsert({
          where: { unitNumber },
          update: { storageTypeId: product.id, floor: product.floor, zone: product.code.split('-')[1] ?? null, row: 1, position: index },
          create: { storageTypeId: product.id, unitNumber, floor: product.floor, zone: product.code.split('-')[1] ?? null, row: 1, position: index, status: initialStatus },
        });
      }
    }

    const email = process.env.SEED_MANAGER_EMAIL?.trim().toLowerCase();
    const password = process.env.SEED_MANAGER_PASSWORD;
    const fullName = process.env.SEED_MANAGER_NAME?.trim();
    const phone = process.env.SEED_MANAGER_PHONE?.trim();
    if (!email || !password || password.length < 12 || !fullName || !phone) {
      throw new Error('Set SEED_MANAGER_EMAIL, SEED_MANAGER_PASSWORD (12+ chars), SEED_MANAGER_NAME and SEED_MANAGER_PHONE before seeding.');
    }
    const hash = await passwordHash(password);
    await prisma.user.upsert({
      where: { email },
      update: { fullName, phone, role: 'MANAGER', passwordHash: hash },
      create: { email, fullName, phone, role: 'MANAGER', passwordHash: hash },
    });
    console.log('Seed complete: 1 facility, 6 storage products, 30 demo units and 1 development manager.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Seed failed.');
  process.exitCode = 1;
});
