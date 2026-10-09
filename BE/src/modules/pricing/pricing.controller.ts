import { Body, Controller, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBody, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PricingQuoteRequestDto } from '../../openapi/api-dtos.js';
import { PricingService } from './pricing.service.js';

@Controller('pricing')
@ApiTags('Pricing')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Post('quote')
  @ApiOperation({ summary: 'Xem trước báo giá', description: 'Public. Chỉ tính toán; không tạo Reservation, không giữ unit, không tạo Payment hoặc Contract.' })
  @ApiBody({
    type: PricingQuoteRequestDto,
    examples: {
      daily: { summary: 'Kho nhỏ tiêu chuẩn 7 ngày', value: { storageTypeId: 'sm-b12', quantity: 1, startDate: '2026-10-10', endDate: '2026-10-17', paymentPlan: 'PAY_MONTHLY' } },
      monthly: { summary: 'Kho vừa điều hòa 1 tháng', value: { storageTypeId: 'md-e06', quantity: 1, startDate: '2026-10-10', endDate: '2026-11-10', paymentPlan: 'PAY_MONTHLY' } },
      prepaid: { summary: 'Kho nhỏ tiêu chuẩn 6 tháng trả trước', value: { storageTypeId: 'sm-b12', quantity: 1, startDate: '2026-10-10', endDate: '2027-04-10', paymentPlan: 'PREPAID' } },
    },
  })
  @ApiOkResponse({ description: 'Chi tiết giá VND. amountPayableNow là null vì chưa triển khai Payment.', schema: { example: { currency: 'VND', storageTypeId: 'sm-b12', storageTypeName: 'Kho nhỏ B12', quantity: 1, startDate: '2026-10-10', endDate: '2026-10-17', billingMode: 'DAILY', billableDays: 7, termMonths: null, paymentPlan: 'PAY_MONTHLY', monthlyUnitPrice: 1500000, dailyUnitPrice: '50000', baseRentalAmount: 350000, discountPercent: 0, discountAmount: 0, rentalAmount: 350000, depositAmount: 350000, quotedTotalAmount: 700000, amountPayableNow: null } } })
  @ApiBadRequestResponse({ description: 'Ngày, số lượng, paymentPlan, thời hạn tối thiểu hoặc loại kỳ thuê không được hỗ trợ.', schema: { examples: { unsupportedTerm: { value: { statusCode: 400, code: 'UNSUPPORTED_RENTAL_TERM', message: 'Thời hạn phải là thuê ngắn ngày hợp lệ hoặc đúng số tháng theo lịch.' } }, minimumTerm: { value: { statusCode: 400, code: 'MINIMUM_RENTAL_TERM', message: 'Loại kho này yêu cầu thời hạn tối thiểu một tháng theo lịch.' } } } } })
  @ApiNotFoundResponse({ description: 'Không tìm thấy StorageType.', schema: { example: { statusCode: 404, code: 'STORAGE_TYPE_NOT_FOUND', message: 'Không tìm thấy loại kho.' } } })
  quote(@Body() body: Record<string, unknown>) {
    return this.pricing.quote(body);
  }
}
