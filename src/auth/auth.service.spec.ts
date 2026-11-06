import { type AppConfigService } from '../config/app-config.service';
import { type PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { type SessionService } from './session.service';

function buildService(demoLoginEnabled: boolean) {
  const findUnique = jest.fn();
  const issue = jest.fn().mockResolvedValue({ accessToken: 'signed-token' });
  const service = new AuthService(
    { user: { findUnique } } as unknown as PrismaService,
    { issue } as unknown as SessionService,
    { auth: { demoLoginEnabled } } as unknown as AppConfigService,
  );
  return { service, findUnique, issue };
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

  it('issues a session without a device for an active user', async () => {
    const { service, findUnique, issue } = buildService(true);
    findUnique.mockResolvedValue({
      id: 'u',
      email: 'ana.asociado@demo.com',
      fullName: 'Ana',
      isActive: true,
      roles: [{ buildingId: null, role: { name: 'ASOCIADO' } }],
    });

    await service.loginDemo(' Ana.Asociado@demo.com ');

    expect(issue).toHaveBeenCalledWith(expect.objectContaining({ roles: ['ASOCIADO'] }));
    expect(issue.mock.calls[0]).toHaveLength(1);
  });
});
