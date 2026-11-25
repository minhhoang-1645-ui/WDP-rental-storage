import { BadRequestException, Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BookingService } from '../booking/booking.service.js';
import { approvedDurations } from '../booking/booking.types.js';
import { businessDate, isIsoCalendarDate } from '../../business-date.js';

@Controller('storage')
@ApiTags('Storage')
export class StorageController {
  constructor(private readonly booking: BookingService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách kho', description: 'Guest access. Có thể lọc catalog theo kích thước, điều kiện và giai đoạn thuê.' })
  @ApiQuery({ name: 'size', required: false, enum: ['all', 'locker', 'small', 'medium', 'large'], example: 'small' })
  @ApiQuery({ name: 'type', required: false, enum: ['all', 'standard', 'climate'], example: 'standard' })
  @ApiQuery({ name: 'facilityId', required: false, description: 'Chỉ trả loại kho tại cơ sở được chọn.' })
  @ApiQuery({ name: 'duration', required: false, enum: ['1', '3', '6', '12', 'flexible'], example: '3' })
  @ApiQuery({ name: 'date', required: false, example: '2026-11-01', description: 'Ngày bắt đầu; chỉ lọc theo availability khi duration không phải flexible.' })
  @ApiOkResponse({ description: 'Catalog đã lọc, gồm quy tắc Pricing V1 cần cho frontend.', schema: { example: { items: [{ id: 'sm-b12', code: 'SM-B12', name: 'Kho nhỏ B12', sizeId: 'small', condition: 'standard', monthlyPrice: 1500000, minRentalDays: 7, allowDailyRental: true, dimensions: '1,5 × 2,0 × 2,4 m', floorArea: '3 m²', volume: 'Khoảng 7,2 m³' }], checkedPeriod: true, total: 1 } } })
  @ApiBadRequestResponse({ description: 'Bộ lọc không hợp lệ.' })
  async list(@Query() query: Record<string, unknown>) {
    const catalog = await this.booking.getCatalog();
    const facilityId = query.facilityId;
    if (facilityId !== undefined && (typeof facilityId !== 'string' || !catalog.facilities?.some(facility => facility.id === facilityId))) {
      throw new BadRequestException('Cơ sở không có trong danh mục công khai.');
    }
    const size = query.size ?? 'all';
    const condition = query.type ?? 'all';
    if (size !== 'all' && !catalog.sizes.some((item) => item.id === size)) throw new BadRequestException('Kích thước kho không hợp lệ.');
    if (!['all', 'standard', 'climate'].includes(condition as string)) throw new BadRequestException('Loại kho không hợp lệ.');
    const duration = query.duration ?? '3';
    if (typeof duration !== 'string' || (duration !== 'flexible' && !approvedDurations.some((value) => String(value) === duration))) {
      throw new BadRequestException('Thời hạn thuê không hợp lệ.');
    }
    const startDate = query.date;
    if (startDate !== undefined && (typeof startDate !== 'string' || !isIsoCalendarDate(startDate) || startDate < businessDate())) {
      throw new BadRequestException('Ngày bắt đầu không hợp lệ.');
    }
    const checkedPeriod = Boolean(startDate && duration !== 'flexible');
    let items = catalog.products.filter((item) => (!facilityId || item.facilityId === facilityId)
      && (size === 'all' || item.sizeId === size) && (condition === 'all' || item.condition === condition));
    if (checkedPeriod) {
      const draft = { startDate, periodMode: 'duration', durationMonths: Number(duration), quantity: 1, addonIds: [], paymentChoice: 'pay-later', paymentPlan: 'PAY_MONTHLY' };
      const checks = await Promise.all(items.map(async (item) => ({
        item,
        result: await this.booking.checkAvailability({ ...draft, productId: item.id, facilityId: item.facilityId }),
      })));
      items = checks.filter(({ result }) => result.available).map(({ item }) => item);
    }
    return { items, checkedPeriod, total: items.length };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một loại kho', description: 'Guest access.' })
  @ApiParam({ name: 'id', example: 'sm-b12', description: 'Product ID.' })
  @ApiOkResponse({ description: 'Sản phẩm trong catalog cùng quy tắc thuê tối thiểu.', schema: { example: { id: 'sm-b12', code: 'SM-B12', name: 'Kho nhỏ B12', sizeId: 'small', condition: 'standard', status: 'available', monthlyPrice: 1500000, minRentalDays: 7, allowDailyRental: true, dimensions: '1,5 × 2,0 × 2,4 m', floorArea: '3 m²', volume: 'Khoảng 7,2 m³' } } })
  @ApiNotFoundResponse({ description: 'Không tìm thấy kho.' })
  async get(@Param('id') id: string) {
    const catalog = await this.booking.getCatalog();
    const item = catalog.products.find((candidate) => candidate.id === id);
    if (!item) throw new NotFoundException('Không tìm thấy kho.');
    return item;
  }
}
