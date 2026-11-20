import { UnauthorizedException } from '@nestjs/common';
import type { PublicUser } from './auth.types.js';

type VerifiedAccount = Pick<PublicUser, 'id' | 'fullName' | 'email' | 'role'>;

export class AccountDisabledException extends UnauthorizedException {
  readonly verifiedAccount?: VerifiedAccount;

  constructor(account?: VerifiedAccount) {
    super({ statusCode: 401, code: 'ACCOUNT_DISABLED', message: 'Tài khoản đã bị vô hiệu hóa.' });
    if (account) {
      const { id, fullName, email, role } = account;
      this.verifiedAccount = { id, fullName, email, role };
    }
  }
}
