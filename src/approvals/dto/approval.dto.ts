import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class DecideApprovalDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT'] })
  @IsIn(['APPROVE', 'REJECT'])
  decision: string;

  /** Obligatorio al rechazar (HU-15) */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comments?: string;
}
