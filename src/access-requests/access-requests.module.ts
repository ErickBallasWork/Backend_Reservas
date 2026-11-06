import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AccessRequestsController } from './access-requests.controller';
import { AccessRequestsService } from './access-requests.service';

@Module({
  imports: [UsersModule],
  controllers: [AccessRequestsController],
  providers: [AccessRequestsService],
})
export class AccessRequestsModule {}
