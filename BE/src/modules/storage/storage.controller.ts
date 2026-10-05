import { BadRequestException, Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BookingService } from '../booking/booking.service.js';
import { approvedDurations } from '../booking/booking.types.js';

@Controller('storage')
@ApiTags('Storage')
export class StorageController {
  constructor(private readonly booking: BookingService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách kho', description: 'Guest access. Có thể lọc catalog theo kích thước, điều kiện và giai đoạn thuê.' })
  @ApiQuery({ name: 'size', required: false, enum: ['all', 'locker', 'small', 'medium', 'large'], example: 'small' })
  @ApiQuery({ name: 'type', required: false, enum: ['all', 'standard', 'climate'], example: 'standard' })
  @ApiQuery({ name: 'duration', required: false, enum: ['1', '3', '6', '12', 'flexible'], example: '3' })
  @ApiQuery({ name: 'date', required: false, example: '2026-11-01', description: 'Ngày bắt đầu; chỉ lọc theo availability khi duration không phải flexible.' })
  @ApiOkResponse({ description: 'Catalog đã lọc.', schema: { example: { items: [{ id: 'sm-b12', code: 'SM-B12', name: 'Kho nhỏ B12', sizeId: 'small', condition: 'standard', dimensions: '1,5 × 2,0 × 2,4 m', floorArea: '3 m²', volume: 'Khoảng 7,2 m³' }], checkedPeriod: true, total: 1 } } })
  @ApiBadRequestResponse({ description: 'Bộ lọc không hợp lệ.' })
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
  @ApiOperation({ summary: 'Chi tiết một loại kho', description: 'Guest access.' })
  @ApiParam({ name: 'id', example: 'sm-b12', description: 'Product ID.' })
  @ApiOkResponse({ description: 'Sản phẩm trong catalog.', schema: { example: { id: 'sm-b12', code: 'SM-B12', name: 'Kho nhỏ B12', sizeId: 'small', condition: 'standard', status: 'available', monthlyPrice: null, dimensions: '1,5 × 2,0 × 2,4 m', floorArea: '3 m²', volume: 'Khoảng 7,2 m³' } } })
  @ApiNotFoundResponse({ description: 'Không tìm thấy kho.' })
  async get(@Param('id') id: string) {
    const catalog = await this.booking.getCatalog();
    const item = catalog.products.find((candidate) => candidate.id === id);
    if (!item) throw new NotFoundException('Không tìm thấy kho.');
    return item;
  }
}
