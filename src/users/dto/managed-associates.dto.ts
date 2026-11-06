import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

const MAX_MANAGED_ASSOCIATES = 500;

export class ReplaceManagedAssociatesDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Replaces the whole list of associates in charge',
  })
  @IsArray()
  @ArrayMaxSize(MAX_MANAGED_ASSOCIATES)
  @IsUUID('all', { each: true })
  associateIds!: string[];
}
