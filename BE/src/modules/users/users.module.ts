import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MemoryUserRepository, PrismaUserRepository, UserRepository } from './user.repository.js';

@Module({
  providers: [{
    provide: UserRepository,
    inject: [PrismaService],
    useFactory: (prisma: PrismaService) => {
      const mode = process.env.USER_STORAGE ?? 'memory';
      if (mode === 'prisma') return new PrismaUserRepository(prisma);
      if (mode !== 'memory' || process.env.NODE_ENV === 'production') {
        throw new Error('Set USER_STORAGE=prisma for production; supported values: memory, prisma.');
      }
      return new MemoryUserRepository();
    },
  }],
  exports: [UserRepository],
})
export class UsersModule {}
