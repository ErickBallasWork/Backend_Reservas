import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../common/current-user/current-user.decorator';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { ApiErrorResponses } from '../common/error-response.dto';
import { UpdateUserDto } from './dto/user.dto';
import { MeResponseDto, RoleResponseDto, UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@ApiTags('Usuarios y roles')
@ApiErrorResponses(400, 401, 403, 404, 409)
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOkResponse({ type: MeResponseDto })
  @ApiOperation({ summary: 'Mi perfil, roles y si tengo una sanción activa' })
  me(@CurrentUser() user: CurrentUserData) {
    return this.users.me(user);
  }

  @Get('roles')
  @ApiOkResponse({ type: [RoleResponseDto] })
  @ApiOperation({ summary: 'Roles del sistema' })
  roles() {
    return this.users.listRoles();
  }

  @Roles('ADMIN')
  @Get('users')
  @ApiOkResponse({ type: [UserResponseDto] })
  @ApiOperation({ summary: 'Listar usuarios con sus roles' })
  list() {
    return this.users.list();
  }

  @Roles('ADMIN')
  @Patch('users/:id')
  @ApiOkResponse({ type: UserResponseDto })
  @ApiOperation({ summary: 'Activar o desactivar un usuario y asignar sus roles' })
  update(
    @CurrentUser() admin: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(admin, id, dto);
  }
}
