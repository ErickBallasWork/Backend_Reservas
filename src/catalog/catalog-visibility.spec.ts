import { type CurrentUserData } from '../common/current-user/current-user.types';
import { assertMayListInactive } from './catalog-visibility';

function actor(...roles: string[]): CurrentUserData {
  return { id: 'u1', email: 'u@tcs.com', fullName: 'U', roles, spocBuildingIds: [] };
}

function thrownBy(run: () => void): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('assertMayListInactive', () => {
  it.each([['ADMIN'], ['SUPERADMIN']])('lets %s list inactive records', (role) => {
    expect(() => assertMayListInactive(actor(role), true)).not.toThrow();
  });

  it.each([['ASOCIADO'], ['LIDER'], ['SPOC_EDIFICIO']])('rejects %s', (role) => {
    const thrown = thrownBy(() => assertMayListInactive(actor(role), true));

    expect(thrown).toMatchObject({ response: { code: 'FORBIDDEN_ROLE' } });
  });

  it('lets anyone list when inactive records are not requested', () => {
    expect(() => assertMayListInactive(actor('ASOCIADO'), false)).not.toThrow();
    expect(() => assertMayListInactive(actor('ASOCIADO'))).not.toThrow();
  });
});
