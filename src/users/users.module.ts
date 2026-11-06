import { Module } from '@nestjs/common';
import { ManagedAssociatesController } from './managed-associates.controller';
import { ManagedAssociatesService } from './managed-associates.service';
import { RoleRowsService } from './role-rows.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController, ManagedAssociatesController],
  providers: [UsersService, ManagedAssociatesService, RoleRowsService],
  exports: [RoleRowsService],
})
export class UsersModule {}
