import { BadRequestException, Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { BookingService } from '../booking/booking.service.js';
import { storageListings, storageSizes } from './storage.catalog.js';
import { approvedDurations } from '../booking/booking.types.js';

@Controller('storage')
export class StorageController {
  constructor(private readonly booking: BookingService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    const size = query.size ?? 'all';
    const condition = query.type ?? 'all';
    if (size !== 'all' && !storageSizes.some(item => item.id === size)) throw new BadRequestException('Kích thước kho không hợp lệ.');
    if (!['all', 'standard', 'climate'].includes(condition as string)) throw new BadRequestException('Loại kho không hợp lệ.');
    const duration = query.duration ?? '3';
    if (typeof duration !== 'string' || (duration !== 'flexible' && !approvedDurations.some(value => String(value) === duration))) {
      throw new BadRequestException('Thời hạn thuê không hợp lệ.');
    }
    if (query.date !== undefined && typeof query.date !== 'string') throw new BadRequestException('Ngày bắt đầu không hợp lệ.');
    const checkedPeriod = Boolean(query.date && duration !== 'flexible');
    const draft = { startDate: query.date, periodMode: 'duration', durationMonths: duration === 'flexible' ? 1 : Number(duration), quantity: 1, addonIds: [], paymentChoice: 'pay-later' };
    // Validate even if the selected category has no products; flexible searches do not promise availability.
    if (query.date) this.booking.checkAvailability({ ...draft, productId: storageListings[0]!.id });
    const items = storageListings.filter(item => (size === 'all' || item.sizeId === size) && (condition === 'all' || item.condition === condition))
      .filter(item => !checkedPeriod || this.booking.checkAvailability({ ...draft, productId: item.id }).available);
    return { items, checkedPeriod, total: items.length };
  }

  @Get(':id')
  get(@Param('id') id: string) {
    const item = storageListings.find(item => item.id === id);
    if (!item) throw new NotFoundException('Không tìm thấy kho.');
    return item;
  }
}
