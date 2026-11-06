import { ForbiddenException } from '@nestjs/common';
import { assertCanManageRoles, removesSuperadminAccess } from './role-assignment.policy';

function forbiddenCode(action: () => void): unknown {
  try {
    action();
  } catch (error) {
    if (error instanceof ForbiddenException) return (error.getResponse() as { code: string }).code;
    throw error;
  }
  return null;
}

describe('assertCanManageRoles', () => {
  it('lets a SUPERADMIN manage any user', () => {
    expect(() =>
      assertCanManageRoles(['SUPERADMIN'], ['ADMIN'], ['ADMIN', 'SUPERADMIN']),
    ).not.toThrow();
  });

  it('lets an ADMIN manage regular roles', () => {
    expect(() =>
      assertCanManageRoles(['ADMIN'], ['ASOCIADO'], ['ASOCIADO', 'LIDER']),
    ).not.toThrow();
  });

  it.each(['ADMIN', 'SUPERADMIN'])('stops an ADMIN from granting %s', (role) => {
    expect(
      forbiddenCode(() => assertCanManageRoles(['ADMIN'], ['ASOCIADO'], ['ASOCIADO', role])),
    ).toBe('FORBIDDEN_ROLE_ASSIGNMENT');
  });

  it('stops an ADMIN from changing a user who already has a privileged role', () => {
    expect(forbiddenCode(() => assertCanManageRoles(['ADMIN'], ['SUPERADMIN']))).toBe(
      'FORBIDDEN_ROLE_ASSIGNMENT',
    );
  });
});

describe('removesSuperadminAccess', () => {
  const activeSuperadmin = { isActive: true, roles: ['SUPERADMIN'] };

  it('detects the deactivation of a SUPERADMIN', () => {
    expect(removesSuperadminAccess(activeSuperadmin, { isActive: false })).toBe(true);
  });

  it('detects a role list without SUPERADMIN', () => {
    expect(removesSuperadminAccess(activeSuperadmin, { roles: ['ADMIN'] })).toBe(true);
  });

  it('ignores changes that keep the access', () => {
    expect(removesSuperadminAccess(activeSuperadmin, { roles: ['SUPERADMIN', 'LIDER'] })).toBe(
      false,
    );
    expect(removesSuperadminAccess(activeSuperadmin, {})).toBe(false);
  });

  it('ignores users that are not active SUPERADMINs', () => {
    expect(
      removesSuperadminAccess({ isActive: false, roles: ['SUPERADMIN'] }, { isActive: false }),
    ).toBe(false);
    expect(removesSuperadminAccess({ isActive: true, roles: ['ADMIN'] }, { isActive: false })).toBe(
      false,
    );
  });
});
