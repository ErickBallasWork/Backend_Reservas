import { ApiProperty } from '@nestjs/swagger';
import {
  ACCESS_REQUEST_KINDS,
  ACCESS_REQUEST_STATUSES,
  type AccessRequestKind,
  type AccessRequestStatus,
} from '../../common/constants';

export class AccessRequestCreatedResponseDto {
  @ApiProperty({ format: 'uuid' })
  requestId!: string;
}

export class AccessRequestStatusResponseDto {
  @ApiProperty({ enum: ACCESS_REQUEST_STATUSES, enumName: 'AccessRequestStatus' })
  status!: AccessRequestStatus;

  @ApiProperty({ type: String, nullable: true })
  decisionComment!: string | null;
}

export class AccessRequestResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ type: String, nullable: true })
  department!: string | null;

  @ApiProperty({ enum: ACCESS_REQUEST_KINDS, enumName: 'AccessRequestKind' })
  kind!: AccessRequestKind;

  @ApiProperty({ enum: ACCESS_REQUEST_STATUSES, enumName: 'AccessRequestStatus' })
  status!: AccessRequestStatus;

  @ApiProperty({ type: String, nullable: true })
  deviceLabel!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  requestedAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  decidedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  decidedByName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  decisionComment!: string | null;
}

export class AccessRequestPageResponseDto {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty({ type: [AccessRequestResponseDto] })
  items!: AccessRequestResponseDto[];
}
