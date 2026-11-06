import { Prisma } from '@prisma/client';
import { rethrowNameTaken } from './catalog-errors';

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('failure', { code, clientVersion: 'test' });
}

function thrownBy(run: () => void): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('rethrowNameTaken', () => {
  it('turns a unique violation into a building name conflict', () => {
    const thrown = thrownBy(() => rethrowNameTaken(prismaError('P2002'), 'building'));

    expect(thrown).toMatchObject({ response: { code: 'BUILDING_NAME_TAKEN' } });
  });

  it('turns a unique violation into a resource name conflict', () => {
    const thrown = thrownBy(() => rethrowNameTaken(prismaError('P2002'), 'resource'));

    expect(thrown).toMatchObject({ response: { code: 'RESOURCE_NAME_TAKEN' } });
  });

  it('rethrows any other error untouched', () => {
    const other = prismaError('P2034');

    expect(thrownBy(() => rethrowNameTaken(other, 'resource'))).toBe(other);
  });
});
