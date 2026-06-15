import { Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtClaims } from '../../common/auth.types';
import { CreateZoneDto, UpdateZoneDto } from './zone.dto';
import { ZoneService } from './zone.service';

@ApiTags('Zones')
@ApiBearerAuth('access-token')
@Controller('zones')
export class ZoneController {
  constructor(private readonly zones: ZoneService) {}

  @Roles('supervisor', 'admin')
  @ApiOperation({
    summary: 'List zones',
    description: 'Admin sees all zones; supervisor sees their own zones.',
  })
  @ApiOkResponse({ description: 'Zones.' })
  @Get()
  list(@CurrentUser() user: JwtClaims, @Req() request: Request) {
    return this.zones.list(user, request.scope);
  }

  @Roles('admin')
  @ApiOperation({
    summary: 'Create a zone (admin)',
    description: 'Creates a new zone with a GeoJSON boundary.',
  })
  @ApiCreatedResponse({ description: 'The created zone.' })
  @Post()
  create(@Body() dto: CreateZoneDto) {
    return this.zones.create(dto);
  }

  @Roles('admin')
  @ApiOperation({
    summary: 'Update a zone (admin)',
    description: 'Updates zone fields (name, province, boundary, active flag).',
  })
  @ApiParam({ name: 'id', description: 'Zone uuid', format: 'uuid' })
  @ApiOkResponse({ description: 'The updated zone.' })
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateZoneDto) {
    return this.zones.update(id, dto);
  }
}
