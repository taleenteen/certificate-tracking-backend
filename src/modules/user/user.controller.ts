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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
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

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UserController {
  constructor(private readonly users: UserService) {}

  @Roles('officer', 'admin')
  @ApiOperation({
    summary: 'List users',
    description:
      'Admin sees all users; officer sees only their own agency. Filter by ' +
      'role / zone / status / free-text query.',
  })
  @ApiOkResponse({ description: 'Matching users.' })
  @Get()
  list(@Query() query: UserQueryDto, @CurrentUser() user: JwtClaims) {
    return this.users.list(query, user);
  }

  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Create a user (admin/super_admin)',
    description:
      'Admin creates SUPERVISOR/INSPECTOR accounts. super_admin may also create ADMIN accounts.',
  })
  @ApiCreatedResponse({ description: 'The created user (with temp password).' })
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: JwtClaims) {
    return this.users.create(dto, user);
  }

  @Roles('admin')
  @ApiOperation({
    summary: 'Set user roles (admin only — D1)',
    description: 'Replaces the user’s role set. Admin-only by locked decision.',
  })
  @ApiParam({ name: 'id', description: 'User uuid', format: 'uuid' })
  @ApiOkResponse({ description: 'The updated user.' })
  @Patch(':id/roles')
  roles(
    @Param('id') id: string,
    @Body() dto: UpdateRolesDto,
    @CurrentUser() user: JwtClaims,
  ) {
    return this.users.updateRoles(id, dto.roles, user);
  }

  @Roles('officer', 'admin')
  @ApiOperation({
    summary: 'Set user agency',
    description:
      'Admin: any user. Supervisor: only within their own agency (else 403).',
  })
  @ApiParam({ name: 'id', description: 'User uuid', format: 'uuid' })
  @ApiOkResponse({ description: 'The updated user.' })
  @ApiForbiddenResponse({ description: 'Cross-agency change by a officer.' })
  @Patch(':id/agency')
  agency(
    @Param('id') id: string,
    @Body() dto: UpdateAgencyDto,
    @CurrentUser() user: JwtClaims,
  ) {
    return this.users.updateAgency(id, dto.agencyId, user);
  }

  @Roles('officer', 'admin')
  @ApiOperation({
    summary: 'Replace a user’s zones',
    description:
      'Replaces the user’s zone assignments. Supervisors may only assign ' +
      'their own zones.',
  })
  @ApiParam({ name: 'id', description: 'User uuid', format: 'uuid' })
  @ApiCreatedResponse({ description: 'The updated zone assignments.' })
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
  @ApiOperation({
    summary: 'Suspend a user (admin)',
    description: 'Sets isActive=false and revokes all of the user’s sessions.',
  })
  @ApiParam({ name: 'id', description: 'User uuid', format: 'uuid' })
  @ApiOkResponse({ description: 'The suspended user.' })
  @Patch(':id/suspend')
  suspend(@Param('id') id: string, @CurrentUser() user: JwtClaims) {
    return this.users.suspend(id, user);
  }

  @Roles('admin')
  @ApiOperation({
    summary: 'Delete a user (admin)',
    description: 'Soft-deletes the user and revokes all sessions.',
  })
  @ApiParam({ name: 'id', description: 'User uuid', format: 'uuid' })
  @ApiOkResponse({ description: 'Deletion result.' })
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtClaims) {
    return this.users.remove(id, user);
  }
}
