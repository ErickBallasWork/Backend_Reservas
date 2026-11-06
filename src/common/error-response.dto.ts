import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiProperty, ApiResponse } from '@nestjs/swagger';
import { ERROR_CODES, type ErrorCode } from './error-codes';

export class ApiErrorResponseDto {
  @ApiProperty({ example: 404 })
  statusCode!: number;

  @ApiProperty({ enum: ERROR_CODES, enumName: 'ErrorCode', example: 'RESOURCE_NOT_FOUND' })
  code!: ErrorCode;

  @ApiProperty({
    description: 'Spanish message, or the list of validation messages for a 400',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  message!: string | string[];

  @ApiProperty({ example: '/api/v1/resources/123' })
  path!: string;

  @ApiProperty({ format: 'date-time' })
  timestamp!: string;
}

export function ApiErrorResponses(...statuses: number[]) {
  return applyDecorators(
    ApiExtraModels(ApiErrorResponseDto),
    ...statuses.map((status) =>
      ApiResponse({ status, description: 'Error', type: ApiErrorResponseDto }),
    ),
  );
}
