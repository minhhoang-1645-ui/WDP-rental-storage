import { BadRequestException, Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { BookingService } from '../booking/booking.service.js';
import { approvedDurations } from '../booking/booking.types.js';

@Controller('storage')
export class StorageController {
  constructor(private readonly booking: BookingService) {}

  @Get()
  async list(@Query() query: Record<string, unknown>) {
    const catalog = await this.booking.getCatalog();
    const size = query.size ?? 'all';
    const condition = query.type ?? 'all';
    if (size !== 'all' && !catalog.sizes.some((item) => item.id === size)) throw new BadRequestException('Kích thước kho không hợp lệ.');
    if (!['all', 'standard', 'climate'].includes(condition as string)) throw new BadRequestException('Loại kho không hợp lệ.');
    const duration = query.duration ?? '3';
    if (typeof duration !== 'string' || (duration !== 'flexible' && !approvedDurations.some((value) => String(value) === duration))) {
      throw new BadRequestException('Thời hạn thuê không hợp lệ.');
    }
    if (query.date !== undefined && typeof query.date !== 'string') throw new BadRequestException('Ngày bắt đầu không hợp lệ.');
    const checkedPeriod = Boolean(query.date && duration !== 'flexible');
    const draft = { startDate: query.date, periodMode: 'duration', durationMonths: duration === 'flexible' ? 1 : Number(duration), quantity: 1, addonIds: [], paymentChoice: 'pay-later' };
    let items = catalog.products.filter((item) => (size === 'all' || item.sizeId === size) && (condition === 'all' || item.condition === condition));
    if (query.date && catalog.products[0]) await this.booking.checkAvailability({ ...draft, productId: catalog.products[0].id });
    if (checkedPeriod) {
      const checks = await Promise.all(items.map(async (item) => ({
        item,
        result: await this.booking.checkAvailability({ ...draft, productId: item.id }),
      })));
      items = checks.filter(({ result }) => result.available).map(({ item }) => item);
    }
    return { items, checkedPeriod, total: items.length };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const catalog = await this.booking.getCatalog();
    const item = catalog.products.find((candidate) => candidate.id === id);
    if (!item) throw new NotFoundException('Không tìm thấy kho.');
    return item;
  }
}
