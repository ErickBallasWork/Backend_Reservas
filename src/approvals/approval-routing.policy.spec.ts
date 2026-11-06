import { type CurrentUserData } from '../common/current-user/current-user.types';
import { assertRouted, routeDecision } from './approval-routing.policy';

const user = (id: string, roles: string[]): CurrentUserData => ({
  id,
  email: `${id}@tcs.com`,
  fullName: id,
  roles,
  spocBuildingIds: [],
});

function codeOf(action: () => void): unknown {
  try {
    action();
  } catch (error) {
    return (error as { response: { code: string } }).response.code;
  }
  return null;
}

describe('routeDecision', () => {
  it('lets an assigned leader decide', () => {
    expect(routeDecision(user('leader', ['LIDER']), 'owner', ['leader'])).toBe('ALLOWED');
  });

  it('rejects a leader who is not assigned to the owner', () => {
    expect(routeDecision(user('other', ['LIDER']), 'owner', ['leader'])).toBe('NOT_ROUTED');
  });

  it('never lets anyone decide their own request', () => {
    expect(routeDecision(user('leader', ['LIDER']), 'leader', ['leader'])).toBe('OWN_REQUEST');
    expect(routeDecision(user('root', ['SUPERADMIN']), 'root', [])).toBe('OWN_REQUEST');
  });

  it.each(['ADMIN', 'SUPERADMIN'])('lets %s decide when no leader is assigned', (role) => {
    expect(routeDecision(user('boss', [role]), 'owner', [])).toBe('ALLOWED');
  });

  it.each(['ADMIN', 'SUPERADMIN'])('keeps %s out when a leader is assigned', (role) => {
    expect(routeDecision(user('boss', [role]), 'owner', ['leader'])).toBe('NOT_ROUTED');
  });

  it('keeps a leader out when nobody is assigned and they hold no admin role', () => {
    expect(routeDecision(user('leader', ['LIDER']), 'owner', [])).toBe('NOT_ROUTED');
  });
});

describe('assertRouted', () => {
  it('passes an allowed route', () => {
    expect(codeOf(() => assertRouted('ALLOWED'))).toBeNull();
  });

  it('uses stable codes for the two refusals', () => {
    expect(codeOf(() => assertRouted('OWN_REQUEST'))).toBe('CANNOT_APPROVE_OWN');
    expect(codeOf(() => assertRouted('NOT_ROUTED'))).toBe('NOT_YOUR_APPROVAL');
  });
});
