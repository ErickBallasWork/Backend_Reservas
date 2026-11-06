import { UnauthorizedException } from '@nestjs/common';

/**
 * Protege los endpoints que llaman las tareas programadas (Job de Container Apps).
 * Si JOB_KEY está definida en el entorno, la petición debe traer la cabecera x-job-key con ese valor.
 * En desarrollo, sin JOB_KEY, se permite para poder probar desde Swagger.
 */
export function assertJobKey(provided: string | undefined): void {
  const expected = process.env.JOB_KEY;
  if (!expected) return;
  if (provided !== expected) {
    throw new UnauthorizedException({
      code: 'INVALID_JOB_KEY',
      message: 'Clave de tarea inválida',
    });
  }
}
