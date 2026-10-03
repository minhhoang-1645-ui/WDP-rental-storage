import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { BookingService } from './booking.service.js';

@Controller()
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Get('booking/catalog')
  catalog() {
    return this.bookingService.getCatalog();
  }

  @Post('booking/availability')
  availability(@Body() body: Record<string, unknown>) {
    return this.bookingService.checkAvailability(body);
  }

  @Post('reservations')
  @UseGuards(AuthGuard)
  create(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return this.bookingService.createReservation(request.user!, body);
  }

  @Post('inquiries')
  createInquiry(@Body() body: Record<string, unknown>) {
    return this.bookingService.createInquiry(body);
  }

  @Get('reservations')
  @UseGuards(AuthGuard)
  list(@Req() request: AuthenticatedRequest) {
    return this.bookingService.listReservations(request.user!.id);
  }

  @Get('reservations/:id')
  @UseGuards(AuthGuard)
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.bookingService.getReservation(request.user!, id);
  }

  @Get('inquiries/:id')
  getInquiry(@Param('id') id: string, @Headers('x-inquiry-access-token') accessToken?: string) {
    return this.bookingService.getInquiry(id, accessToken);
  }
}
