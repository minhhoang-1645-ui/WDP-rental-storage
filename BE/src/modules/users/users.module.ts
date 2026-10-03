import { Module } from '@nestjs/common';
import { PrismaUserRepository, UserRepository } from './user.repository.js';

@Module({
  providers: [{ provide: UserRepository, useClass: PrismaUserRepository }],
  exports: [UserRepository],
})
export class UsersModule {}
