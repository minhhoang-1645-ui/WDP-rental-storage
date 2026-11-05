import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AccountOnboardingService } from './account-onboarding.service.js';
@Controller('guest/account')
export class AccountOnboardingController {
  constructor(private readonly flow: AccountOnboardingService) {}
  private limit(req: Request) { return this.flow.limit('account-ip', req.socket.remoteAddress ?? 'unknown', 40); }
  @Post('context') async context(@Body() body: Record<string, unknown>, @Req() req: Request) { await this.limit(req); return this.flow.context(body.token); }
  @Post('setup') async setup(@Body() body: Record<string, unknown>, @Req() req: Request) { await this.limit(req); return this.flow.setup(body); }
  @Post('forgot-password') async forgot(@Body() body: Record<string, unknown>, @Req() req: Request) { await this.limit(req); return this.flow.requestReset(body); }
  @Post('reset-password') async reset(@Body() body: Record<string, unknown>, @Req() req: Request) { await this.limit(req); return this.flow.reset(body); }
  @Post('resend') async resend(@Body() body: Record<string, unknown>, @Req() req: Request) { await this.limit(req); return this.flow.resend(body); }
}
