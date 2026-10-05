import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { LoginRequestDto, RegisterRequestDto } from '../../openapi/api-dtos.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedRequest } from './auth.types.js';

@Controller('auth')
@ApiTags('Auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Đăng ký khách hàng', description: 'Guest access. Role từ request bị bỏ qua; tài khoản mới luôn là CUSTOMER.' })
  @ApiBody({ type: RegisterRequestDto, examples: { customer: { summary: 'Khách hàng mới', value: { fullName: 'Nguyen Van A', email: 'customer@example.test', phone: '0900000000', password: 'your-password-here' } } } })
  @ApiCreatedResponse({ description: 'Tạo CUSTOMER và phiên đăng nhập thành công.', schema: { example: { token: 'token-returned-by-api', user: { id: 'user-id', fullName: 'Nguyen Van A', email: 'customer@example.test', phone: '0900000000', role: 'CUSTOMER' } } } })
  register(@Body() body: Record<string, unknown>) {
    return this.authService.register(body);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Đăng nhập', description: 'Guest access. Dùng cùng endpoint cho CUSTOMER, MANAGER và ADMIN; role trả về từ database.' })
  @ApiBody({ type: LoginRequestDto, examples: { credentials: { summary: 'Thông tin đăng nhập', value: { email: 'customer@example.test', password: 'your-password-here' } } } })
  @ApiOkResponse({ description: 'Đăng nhập thành công.', schema: { example: { token: 'token-returned-by-api', user: { id: 'user-id', fullName: 'Nguyen Van A', email: 'customer@example.test', phone: '0900000000', role: 'CUSTOMER' } } } })
  @ApiUnauthorizedResponse({ description: 'Email hoặc mật khẩu không đúng.', schema: { example: { statusCode: 401, message: 'Email hoặc mật khẩu không đúng.', error: 'Unauthorized' } } })
  login(@Body() body: Record<string, unknown>) {
    return this.authService.login(body);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Lấy người dùng hiện tại', description: 'Bearer authentication required. CUSTOMER, STAFF, MANAGER hoặc ADMIN.' })
  @ApiOkResponse({ description: 'Thông tin public của người dùng; không bao gồm passwordHash.', schema: { example: { id: 'user-id', fullName: 'Nguyen Van A', email: 'customer@example.test', phone: '0900000000', role: 'CUSTOMER' } } })
  @ApiUnauthorizedResponse({ description: 'Thiếu, sai hoặc hết hạn token.' })
  me(@Req() request: AuthenticatedRequest) {
    return request.user;
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Đăng xuất', description: 'Bearer authentication required. CUSTOMER, STAFF, MANAGER hoặc ADMIN.' })
  @ApiNoContentResponse({ description: 'Đã hủy phiên hiện tại.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu, sai hoặc hết hạn token.' })
  logout(@Req() request: AuthenticatedRequest) {
    this.authService.logout(request.headers.authorization!.slice(7));
  }
}
