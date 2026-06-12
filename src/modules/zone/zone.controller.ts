import { Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtClaims } from '../../common/auth.types';
import { CreateZoneDto, UpdateZoneDto } from './zone.dto';
import { ZoneService } from './zone.service';

@Controller('zones')
export class ZoneController {
  constructor(private readonly zones: ZoneService) {}

  @Roles('supervisor', 'admin')
  @Get()
  list(@CurrentUser() user: JwtClaims, @Req() request: Request) {
    return this.zones.list(user, request.scope);
  }

  @Roles('admin')
  @Post()
  create(@Body() dto: CreateZoneDto) {
    return this.zones.create(dto);
  }

  @Roles('admin')
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateZoneDto) {
    return this.zones.update(id, dto);
  }
}
