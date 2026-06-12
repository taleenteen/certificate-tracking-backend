import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtClaims } from '../../common/auth.types';
import {
  CreateUserDto,
  UpdateAgencyDto,
  UpdateRolesDto,
  UpdateZonesDto,
  UserQueryDto,
} from './user.dto';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
  constructor(private readonly users: UserService) {}

  @Roles('supervisor', 'admin')
  @Get()
  list(@Query() query: UserQueryDto, @CurrentUser() user: JwtClaims) {
    return this.users.list(query, user);
  }

  @Roles('admin')
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Roles('admin')
  @Patch(':id/roles')
  roles(@Param('id') id: string, @Body() dto: UpdateRolesDto) {
    return this.users.updateRoles(id, dto.roles);
  }

  @Roles('supervisor', 'admin')
  @Patch(':id/agency')
  agency(
    @Param('id') id: string,
    @Body() dto: UpdateAgencyDto,
    @CurrentUser() user: JwtClaims,
  ) {
    return this.users.updateAgency(id, dto.agency, user);
  }

  @Roles('supervisor', 'admin')
  @Post(':id/zones')
  zones(
    @Param('id') id: string,
    @Body() dto: UpdateZonesDto,
    @CurrentUser() user: JwtClaims,
    @Req() request: Request,
  ) {
    return this.users.updateZones(id, dto.zoneIds, user, request.scope);
  }

  @Roles('admin')
  @Patch(':id/suspend')
  suspend(@Param('id') id: string) {
    return this.users.suspend(id);
  }

  @Roles('admin')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.users.remove(id);
  }
}
