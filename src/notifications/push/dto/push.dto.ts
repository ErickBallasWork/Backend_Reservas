import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';

export class PushKeysDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  p256dh!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  auth!: string;
}

export class RegisterPushSubscriptionDto {
  @ApiProperty({ description: 'Push service URL returned by the browser' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2000)
  endpoint!: string;

  @ApiProperty({ type: PushKeysDto })
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}

export class RemovePushSubscriptionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  endpoint!: string;
}

export class PushConfigResponseDto {
  @ApiProperty({ description: 'false when the server has no VAPID keys' })
  enabled!: boolean;

  @ApiProperty({ nullable: true, description: 'Public key the browser needs to subscribe' })
  publicKey!: string | null;
}

export class PushSubscriptionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
}

export class RemovePushSubscriptionResponseDto {
  @ApiProperty()
  removed!: number;
}
