import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { BookingAvailabilityRequestDto, GuestInquiryRequestDto } from '../../openapi/api-dtos.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { BookingService } from './booking.service.js';

@Controller()
@ApiTags('Booking availability')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Get('booking/catalog')
  @ApiOperation({ summary: 'Catalog dùng cho wizard đặt kho', description: 'Guest access. Nguồn catalog hiện tại của frontend, gồm products, sizes, approvedDurations và chính sách quote.' })
  @ApiOkResponse({ description: 'Catalog WDP.', schema: { example: { products: [{ id: 'sm-b12', code: 'SM-B12', name: 'Kho nhỏ B12', sizeId: 'small', condition: 'standard', monthlyPrice: null }], sizes: [{ id: 'small', name: 'Kho nhỏ', dimensions: '1,5 × 2,0 × 2,4 m', floorArea: '3 m²', volume: 'Khoảng 7,2 m³' }], approvedDurations: [1, 3, 6, 12], addons: [], pricingPolicy: 'QUOTE_REQUIRED', inventoryPolicy: 'DATABASE_PHYSICAL_UNITS' } } })
  catalog() {
    return this.bookingService.getCatalog();
  }

  @Post('booking/availability')
  @ApiOperation({ summary: 'Kiểm tra khả dụng toàn kỳ', description: 'Guest access. Chỉ là kiểm tra thông tin, không giữ kho. Khi submit Inquiry hoặc Reservation, backend sẽ kiểm tra lại.' })
  @ApiBody({ type: BookingAvailabilityRequestDto, examples: { duration: { summary: 'Thời hạn đã duyệt', value: { productId: 'sm-b12', startDate: '2026-11-01', periodMode: 'duration', durationMonths: 3, quantity: 1, adjacencyPreference: false, addonIds: [], note: 'Cần tư vấn thời gian vào kho.', paymentChoice: 'pay-later' } }, customDates: { summary: 'Ngày tùy chọn', value: { productId: 'sm-b12', startDate: '2026-11-01', periodMode: 'dates', endDate: '2026-11-20', quantity: 1, adjacencyPreference: false, addonIds: [], paymentChoice: 'pay-later' } } } })
  @ApiOkResponse({ description: 'Kết quả availability và quote snapshot. Số tiền chưa duyệt luôn là null, không phải 0.', schema: { example: { available: true, startDate: '2026-11-01', endDateExclusive: '2027-02-01', periodStatus: 'APPROVED_DURATION', reasonCode: 'AVAILABLE', message: 'Còn kho vật lý phù hợp cho toàn bộ khoảng thuê. Kết quả này chưa giữ kho.', quote: { status: 'QUOTE_REQUIRED', periodStatus: 'APPROVED_DURATION', lineItems: [{ code: 'storage-rent', label: 'Tiền thuê kho', basis: '3 tháng', amount: null, status: 'QUOTE_REQUIRED' }], rentalSubtotal: null, deposit: null, applicableFees: null, taxes: null, discounts: null, grandTotal: null, amountPayableNow: null, message: 'WDP cần xác nhận báo giá.' } } } })
  @ApiBadRequestResponse({ description: 'Ngày, product, quantity, duration hoặc add-on không hợp lệ.' })
  availability(@Body() body: Record<string, unknown>) {
    return this.bookingService.checkAvailability(body);
  }

  @Post('reservations')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('bearerAuth')
  @ApiTags('Reservation')
  @ApiOperation({ summary: 'Tạo Reservation', description: 'Bearer required. CUSTOMER tạo yêu cầu của mình; Reservation bắt đầu ở PENDING, không phải thanh toán, hợp đồng hay gán kho vật lý.' })
  @ApiBody({ type: BookingAvailabilityRequestDto, examples: { payLater: { summary: 'Reservation chờ xử lý', value: { productId: 'sm-b12', startDate: '2026-11-01', periodMode: 'duration', durationMonths: 3, quantity: 1, adjacencyPreference: false, addonIds: [], note: 'Liên hệ vào buổi sáng.', paymentChoice: 'pay-later' } } } })
  @ApiCreatedResponse({ description: 'Tạo PENDING Reservation. Yêu cầu lặp lại cùng dữ liệu trả về record hiện hữu để chống double-submit.', schema: { example: { id: 'WDP-2026-AB12CD34', status: 'PENDING', productId: 'sm-b12', startDate: '2026-11-01', endDate: '2027-02-01', endDateExclusive: '2027-02-01', quantity: 1, paymentChoice: 'pay-later', paymentStatus: 'NOT_STARTED', unitAssignment: null, persistence: 'DATABASE' } } })
  @ApiBadRequestResponse({ description: 'Payload không hợp lệ hoặc pay-now chưa được hỗ trợ.' })
  @ApiConflictResponse({ description: 'Kho không đủ cho toàn bộ kỳ thuê khi backend kiểm tra lại.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  create(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return this.bookingService.createReservation(request.user!, body);
  }

  @Post('inquiries')
  @ApiTags('Contact Inquiry')
  @ApiOperation({ summary: 'Tạo Contact Inquiry', description: 'Guest access. Inquiry bắt đầu PENDING_CONTACT; không thanh toán, không giữ kho và không gán unit.' })
  @ApiBody({ type: GuestInquiryRequestDto, examples: { payLater: { summary: 'Yêu cầu báo giá', value: { fullName: 'Nguyen Van A', email: 'customer@example.test', phone: '0900000000', productId: 'sm-b12', startDate: '2026-11-01', periodMode: 'duration', durationMonths: 3, quantity: 1, adjacencyPreference: false, addonIds: [], note: 'Cần WDP gọi lại.', paymentChoice: 'pay-later' } } } })
  @ApiCreatedResponse({ description: 'Inquiry đã lưu. Giữ accessToken ở phía client để gọi GET /api/inquiries/:id; token này chỉ được trả về khi tạo hoặc lặp lại chính request đó.', schema: { example: { id: 'WDPQ-2026-AB12CD34', status: 'PENDING_CONTACT', productId: 'sm-b12', startDate: '2026-11-01', endDateExclusive: '2027-02-01', quantity: 1, paymentChoice: 'pay-later', inventoryGuarantee: false, persistence: 'DATABASE', accessToken: 'lookup-token-returned-by-api' } } })
  @ApiBadRequestResponse({ description: 'Thông tin liên hệ hoặc payload đặt kho không hợp lệ.' })
  @ApiConflictResponse({ description: 'Kho không đủ cho toàn bộ kỳ thuê khi backend kiểm tra lại.' })
  createInquiry(@Body() body: Record<string, unknown>) {
    return this.bookingService.createInquiry(body);
  }

  @Get('reservations')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('bearerAuth')
  @ApiTags('Reservation')
  @ApiOperation({ summary: 'Danh sách Reservation của khách hàng', description: 'Bearer required. CUSTOMER chỉ nhận Reservation thuộc về chính mình.' })
  @ApiOkResponse({ description: 'Danh sách Reservation của user đã đăng nhập.', schema: { example: [{ id: 'WDP-2026-AB12CD34', status: 'PENDING', productId: 'sm-b12', quantity: 1, persistence: 'DATABASE' }] } })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  list(@Req() request: AuthenticatedRequest) {
    return this.bookingService.listReservations(request.user!.id);
  }

  @Get('reservations/:id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('bearerAuth')
  @ApiTags('Reservation')
  @ApiOperation({ summary: 'Chi tiết Reservation', description: 'Bearer required. CUSTOMER chỉ xem Reservation của mình; MANAGER và ADMIN có thể xem để vận hành.' })
  @ApiParam({ name: 'id', example: 'WDP-2026-AB12CD34', description: 'Reservation reference hoặc database id.' })
  @ApiOkResponse({ description: 'Reservation chi tiết.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'CUSTOMER cố xem Reservation của khách khác.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy Reservation.' })
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.bookingService.getReservation(request.user!, id);
  }

  @Get('inquiries/:id')
  @ApiTags('Contact Inquiry')
  @ApiOperation({ summary: 'Tra cứu Contact Inquiry', description: 'Guest endpoint có bảo vệ. Cần X-Inquiry-Access-Token được trả về từ POST /api/inquiries; không dùng bearer token.' })
  @ApiParam({ name: 'id', example: 'WDPQ-2026-AB12CD34', description: 'Inquiry reference hoặc database id.' })
  @ApiHeader({ name: 'X-Inquiry-Access-Token', required: true, description: 'accessToken từ response POST /api/inquiries.' })
  @ApiOkResponse({ description: 'Inquiry chi tiết nếu access token hợp lệ.' })
  @ApiForbiddenResponse({ description: 'Thiếu hoặc sai X-Inquiry-Access-Token.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy Inquiry.' })
  getInquiry(@Param('id') id: string, @Headers('x-inquiry-access-token') accessToken?: string) {
    return this.bookingService.getInquiry(id, accessToken);
  }
}
