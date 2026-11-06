import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { APPROVAL_DECISIONS, type ApprovalDecision } from '../../common/constants';

export class DecideApprovalDto {
  @ApiProperty({ enum: APPROVAL_DECISIONS, enumName: 'ApprovalDecision' })
  @IsIn(APPROVAL_DECISIONS)
  decision!: ApprovalDecision;

  @ApiPropertyOptional({ description: 'Required when the decision is REJECT', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comments?: string;
}

export class SeriesDecisionResponseDto {
  @ApiProperty({ format: 'uuid' })
  seriesId!: string;

  @ApiProperty({ description: 'Occurrences that received the decision' })
  decided!: number;

  @ApiProperty({ description: 'Occurrences left out because someone else decided them first' })
  skipped!: number;
}
