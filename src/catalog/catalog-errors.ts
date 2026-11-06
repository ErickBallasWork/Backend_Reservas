import { ConflictException } from '@nestjs/common';
import { isUniqueViolation } from '../common/db.types';

const NAME_TAKEN = {
  building: { code: 'BUILDING_NAME_TAKEN', message: 'Ya existe un edificio con ese nombre' },
  resource: {
    code: 'RESOURCE_NAME_TAKEN',
    message: 'Ya existe un recurso con ese nombre en el edificio',
  },
};

export function rethrowNameTaken(error: unknown, entity: keyof typeof NAME_TAKEN): never {
  if (isUniqueViolation(error)) {
    throw new ConflictException(NAME_TAKEN[entity]);
  }
  throw error;
}
