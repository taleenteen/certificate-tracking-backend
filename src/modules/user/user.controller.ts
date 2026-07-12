import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
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
  UpdateUserAccessDto,
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
      'super_admin sees all users; admin/officer see their own agency. Filter by ' +
      'role / status / free-text query.',
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
      'Admin creates public/officer accounts. super_admin may also create admin accounts.',
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

  @Roles('super_admin')
  @ApiOperation({
    summary: 'Set staff access atomically (super_admin)',
    description:
      'Assigns the platform roles and agency together. Use this when promoting ' +
      'a verified Tang Rat user to officer so staff scope is never partially configured.',
  })
  @ApiParam({ name: 'id', description: 'User uuid', format: 'uuid' })
  @ApiOkResponse({ description: 'The updated user access.' })
  @ApiForbiddenResponse({ description: 'Rank violation.' })
  @Patch(':id/access')
  access(
    @Param('id') id: string,
    @Body() dto: UpdateUserAccessDto,
    @CurrentUser() user: JwtClaims,
  ) {
    return this.users.updateAccess(id, dto, user);
  }

  @Roles('officer', 'admin')
  @ApiOperation({
    summary: 'Set user agency',
    description:
      'super_admin: any manageable user. admin/officer: only within their own agency (else 403).',
  })
  @ApiParam({ name: 'id', description: 'User uuid', format: 'uuid' })
  @ApiOkResponse({ description: 'The updated user.' })
  @ApiForbiddenResponse({ description: 'Cross-agency or rank violation.' })
  @Patch(':id/agency')
  agency(
    @Param('id') id: string,
    @Body() dto: UpdateAgencyDto,
    @CurrentUser() user: JwtClaims,
  ) {
    return this.users.updateAgency(id, dto.agencyId, user);
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
