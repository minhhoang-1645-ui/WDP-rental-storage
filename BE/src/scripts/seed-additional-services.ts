import 'dotenv/config';
import { PrismaService } from '../prisma/prisma.service.js';

const catalog = [
  { code: 'PADLOCK_DISC', name: 'Disc Padlock', kind: 'PURCHASE', billingUnit: 'ONE_TIME', unitPrice: 220000n, description: 'Mua khóa cho unit.' },
  { code: 'PADLOCK_COMBINATION', name: 'Combination Padlock', kind: 'PURCHASE', billingUnit: 'ONE_TIME', unitPrice: 280000n, description: 'Mua khóa mã số.' },
  { code: 'BOX_SMALL', name: 'Small Moving Box', kind: 'PURCHASE', billingUnit: 'ONE_TIME', unitPrice: 15000n, description: 'Thùng carton nhỏ.' },
  { code: 'BOX_MEDIUM', name: 'Medium Moving Box', kind: 'PURCHASE', billingUnit: 'ONE_TIME', unitPrice: 25000n, description: 'Thùng carton vừa.' },
  { code: 'BOX_LARGE', name: 'Large Moving Box', kind: 'PURCHASE', billingUnit: 'ONE_TIME', unitPrice: 35000n, description: 'Thùng carton lớn.' },
  { code: 'PACKING_TAPE', name: 'Packing Tape', kind: 'PURCHASE', billingUnit: 'ONE_TIME', unitPrice: 25000n, description: 'Băng keo đóng thùng.' },
  { code: 'BUBBLE_WRAP', name: 'Bubble Wrap', kind: 'PURCHASE', billingUnit: 'ONE_TIME', unitPrice: 80000n, description: 'Bọc đồ dễ vỡ.' },
  { code: 'STRETCH_WRAP', name: 'Stretch Wrap', kind: 'PURCHASE', billingUnit: 'ONE_TIME', unitPrice: 100000n, description: 'Quấn đồ và nội thất.' },
  { code: 'PACKING_PAPER', name: 'Packing Paper', kind: 'PURCHASE', billingUnit: 'ONE_TIME', unitPrice: 60000n, description: 'Giấy đóng gói.' },
  { code: 'MOVING_ROPE', name: 'Moving Rope / Tie Down', kind: 'PURCHASE', billingUnit: 'ONE_TIME', unitPrice: 45000n, description: 'Cố định đồ khi vận chuyển.' },
  { code: 'WORK_GLOVES', name: 'Moving Gloves', kind: 'PURCHASE', billingUnit: 'ONE_TIME', unitPrice: 35000n, description: 'Găng tay vận chuyển.' },
  { code: 'UTILITY_DOLLY', name: 'Utility Dolly / Hand Truck', kind: 'RENTAL', billingUnit: 'DAY', unitPrice: 60000n, description: 'Xe đẩy thùng.' },
  { code: 'FURNITURE_DOLLY', name: 'Furniture Dolly', kind: 'RENTAL', billingUnit: 'DAY', unitPrice: 70000n, description: 'Xe đẩy đồ nội thất.' },
  { code: 'APPLIANCE_DOLLY', name: 'Appliance Dolly', kind: 'RENTAL', billingUnit: 'DAY', unitPrice: 100000n, description: 'Di chuyển tủ lạnh và máy giặt.' },
  { code: 'FURNITURE_PAD', name: 'Furniture Pad / Moving Blanket', kind: 'RENTAL', billingUnit: 'DAY', unitPrice: 15000n, description: 'Bảo vệ đồ nội thất.' },
  { code: 'SHELF_STANDARD', name: 'Storage Shelf', kind: 'RENTAL', billingUnit: 'MONTH', unitPrice: 120000n, description: 'Kệ đặt trong unit.' },
  { code: 'DEHUMIDIFIER', name: 'Dehumidifier', kind: 'RENTAL', billingUnit: 'MONTH', unitPrice: 350000n, description: 'Máy hút ẩm.' },
] as const;

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('This development catalog seed is disabled in production.');
  }

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    for (const item of catalog) {
      await prisma.additionalService.upsert({
        where: { code: item.code },
        update: {
          name: item.name,
          kind: item.kind,
          billingUnit: item.billingUnit,
          unitPrice: item.unitPrice,
          description: item.description,
          imageAlt: `${item.name} - hình minh họa sản phẩm`,
          isActive: true,
        },
        create: {
          ...item,
          unitPrice: item.unitPrice,
          imageUrl: null,
          imageAlt: `${item.name} - hình minh họa sản phẩm`,
          isActive: true,
        },
      });
      // Catalog only. Real facility supply must be configured explicitly by its manager.
    }

    const persisted = await prisma.additionalService.findMany({
      where: { code: { in: catalog.map((item) => item.code) } },
      select: { code: true, kind: true, billingUnit: true, unitPrice: true, isActive: true, imageUrl: true },
      orderBy: { code: 'asc' },
    });
    console.log(`Additional service catalog ready: ${persisted.length}/${catalog.length} records.`);
    console.table(
      persisted.map((item) => ({
        code: item.code,
        kind: item.kind,
        billingUnit: item.billingUnit,
        price: item.unitPrice?.toString() ?? 'UNAPPROVED',
        active: item.isActive,
        image: item.imageUrl ?? 'NOT_SET',
      })),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
