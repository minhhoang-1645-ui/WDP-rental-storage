import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { MemoryUserRepository } from '../users/user.repository.js';

const registration = { fullName: 'Nguyen Van A', email: 'customer@example.com', phone: '0901234567', password: ' strong password ' };

describe('Authentication without a database', () => {
  let repository: MemoryUserRepository;
  let service: AuthService;
  beforeEach(() => { repository = new MemoryUserRepository(); service = new AuthService(repository); });
  afterEach(() => vi.restoreAllMocks());

  it('stores a hash, normalizes email, ignores supplied role and never exposes secrets', async () => {
    const session = await service.register({ ...registration, email: ' CUSTOMER@example.com ', role: 'ADMIN' });
    expect(session.user.role).toBe('CUSTOMER');
    expect(session.user.email).toBe(registration.email);
    expect(session.user).not.toHaveProperty('passwordHash');
    const stored = await repository.findById(session.user.id);
    expect(stored?.passwordHash).toMatch(/^scrypt\$/);
    expect(stored?.passwordHash).not.toContain(registration.password);
    expect((await service.login(registration)).user.id).toBe(session.user.id);
    await expect(service.login({ ...registration, password: registration.password.trim() })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows exactly one concurrent registration for the same email', async () => {
    const results = await Promise.allSettled([service.register(registration), service.register(registration)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find(result => result.status === 'rejected');
    expect(failure?.reason).toBeInstanceOf(ConflictException);
  });

  it('rejects invalid bodies, email, phone and oversized passwords', async () => {
    for (const input of [null, {}, { ...registration, email: 'bad' }, { ...registration, phone: 'abcdefgh' }, { ...registration, password: 'a'.repeat(129) }]) {
      await expect(service.register(input as never)).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('rejects wrong credentials without revealing account existence', async () => {
    await service.register(registration);
    for (const input of [{ ...registration, password: 'incorrect' }, { ...registration, email: 'absent@example.com' }]) {
      await expect(service.login(input)).rejects.toThrow('Email hoặc mật khẩu không đúng.');
    }
  });

  it('revokes only the logged-out session', async () => {
    const first = await service.register(registration);
    const second = await service.login(registration);
    service.logout(first.token);
    await expect(service.getUserByToken(first.token)).rejects.toBeInstanceOf(UnauthorizedException);
    expect((await service.getUserByToken(second.token)).id).toBe(first.user.id);
  });

  it('expires sessions after eight hours', async () => {
    const session = await service.register(registration);
    const later = Date.now() + 8 * 60 * 60 * 1000 + 1;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    await expect(service.getUserByToken(session.token)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
