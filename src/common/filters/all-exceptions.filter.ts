import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

const DEFAULT_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
  429: 'TOO_MANY_REQUESTS',
  503: 'SERVICE_UNAVAILABLE',
};

/**
 * Filtro global de errores: toda respuesta de error sale con el mismo formato
 * { statusCode, code, message, path, timestamp }, para que el frontend la muestre fácil.
 * Para lanzar un error con código propio:  throw new ConflictException({ code: 'SLOT_TAKEN', message: '...' })
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errores');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string | undefined;
    let message: string | string[] = 'Ocurrió un error inesperado';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const data = body as Record<string, unknown>;
        message = (data.message as string | string[]) ?? exception.message;
        if (typeof data.code === 'string') code = data.code;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = 'DUPLICATE';
        message = 'Ya existe un registro con esos datos';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = 'NOT_FOUND';
        message = 'El registro no existe';
      } else if (exception.code === 'P2034') {
        // Dos transacciones chocaron al mismo tiempo (bloqueo o deadlock en SQL Server).
        status = HttpStatus.CONFLICT;
        code = 'CONCURRENT_CONFLICT';
        message = 'Otra operación se procesó al mismo tiempo. Intenta de nuevo.';
      } else if (exception.code === 'P2003') {
        status = HttpStatus.CONFLICT;
        code = 'FOREIGN_KEY';
        message = 'El registro está relacionado con otro que no existe o no se puede modificar';
      } else {
        this.logger.error(`Prisma ${exception.code}: ${exception.message}`);
      }
    } else if (exception instanceof Prisma.PrismaClientInitializationError) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      code = 'DATABASE_UNAVAILABLE';
      message = 'La base de datos no está disponible (puede estar despertando). Intenta en un minuto.';
      this.logger.error(exception.message);
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    response.status(status).json({
      statusCode: status,
      code: code ?? DEFAULT_CODES[status] ?? 'ERROR',
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
