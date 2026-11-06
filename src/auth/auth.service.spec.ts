import { type JwtService } from '@nestjs/jwt';
import { type AppConfigService } from '../config/app-config.service';
import { type PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

function buildService(demoLoginEnabled: boolean) {
  const findUnique = jest.fn();
  const service = new AuthService(
    { user: { findUnique } } as unknown as PrismaService,
    { signAsync: jest.fn().mockResolvedValue('signed-token') } as unknown as JwtService,
    { auth: { demoLoginEnabled, jwtExpiresInSeconds: 900 } } as unknown as AppConfigService,
  );
  return { service, findUnique };
}

describe('AuthService.loginDemo', () => {
  it('is not available when the demo login is disabled', async () => {
    const { service, findUnique } = buildService(false);

    await expect(service.loginDemo('ana.asociado@demo.com')).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects an unknown or inactive user', async () => {
    const { service, findUnique } = buildService(true);
    findUnique.mockResolvedValue({ id: 'u', isActive: false, roles: [] });

    await expect(service.loginDemo('ana.asociado@demo.com')).rejects.toMatchObject({
      response: { code: 'UNKNOWN_USER' },
    });
  });

  it('issues a session for an active user', async () => {
    const { service, findUnique } = buildService(true);
    findUnique.mockResolvedValue({
      id: 'u',
      email: 'ana.asociado@demo.com',
      fullName: 'Ana',
      isActive: true,
      roles: [{ buildingId: null, role: { name: 'ASOCIADO' } }],
    });

    const session = await service.loginDemo(' Ana.Asociado@demo.com ');

    expect(session).toMatchObject({ accessToken: 'signed-token', tokenType: 'Bearer' });
    expect(session.user.roles).toEqual(['ASOCIADO']);
  });
});
