import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../common/current-user/current-user.decorator';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('Usuarios y roles')
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Mi perfil, roles y si tengo una sanción activa' })
  me(@CurrentUser() user: CurrentUserData) {
    return this.users.me(user);
  }

  @Get('roles')
  @ApiOperation({ summary: 'Roles del sistema' })
  roles() {
    return this.users.listRoles();
  }

  @Roles('ADMIN')
  @Get('users')
  @ApiOperation({ summary: 'Listar usuarios con sus roles' })
  list() {
    return this.users.list();
  }

  @Roles('ADMIN')
  @Post('users')
  @ApiOperation({ summary: 'Dar de alta un usuario antes de su primer inicio de sesión' })
  create(@CurrentUser() admin: CurrentUserData, @Body() dto: CreateUserDto) {
    return this.users.create(admin, dto);
  }

  @Roles('ADMIN')
  @Patch('users/:id')
  @ApiOperation({ summary: 'Activar o desactivar un usuario y asignar sus roles' })
  update(
    @CurrentUser() admin: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(admin, id, dto);
  }
}
