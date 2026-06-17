import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateLicenseTypeDto, UpdateLicenseTypeDto } from './license.dto';
import { LicenseService } from './license.service';

@ApiTags('Licenses')
@ApiBearerAuth('access-token')
@Controller()
export class LicenseController {
  constructor(private readonly licenses: LicenseService) {}

  @Public()
  @ApiOperation({
    summary: 'List license types (master data)',
    description: 'Returns all active license types across both agencies.',
  })
  @ApiOkResponse({ description: 'Array of license types.' })
  @Get('license-types')
  listTypes() {
    return this.licenses.listTypes();
  }

  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Create a license type (admin)',
    description: 'Creates a new license type master record.',
  })
  @ApiCreatedResponse({ description: 'The created license type.' })
  @Post('license-types')
  createType(@Body() dto: CreateLicenseTypeDto) {
    return this.licenses.createType(dto);
  }

  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Update a license type (admin)',
    description: 'Updates license type fields.',
  })
  @ApiParam({ name: 'id', description: 'LicenseType uuid', format: 'uuid' })
  @ApiOkResponse({ description: 'The updated license type.' })
  @ApiNotFoundResponse({ description: 'Not found.' })
  @Put('license-types/:id')
  updateType(@Param('id') id: string, @Body() dto: UpdateLicenseTypeDto) {
    return this.licenses.updateType(id, dto);
  }

  @Public()
  @ApiOperation({
    summary: 'List license and task statuses (enum reader)',
    description: 'Returns status codes with Thai display names and workflow metadata.',
  })
  @ApiOkResponse({ description: '{ licenseStatuses, taskStatuses } arrays.' })
  @Get('statuses')
  listStatuses() {
    return this.licenses.listStatuses();
  }

  @Public()
  @ApiOperation({
    summary: 'Get a license by id',
    description:
      'Public license detail including type, business, and documents with ' +
      'presigned URLs (10-min TTL).',
  })
  @ApiParam({ name: 'id', description: 'License uuid', format: 'uuid' })
  @ApiOkResponse({ description: 'The license with related data.' })
  @ApiNotFoundResponse({ description: 'License not found.' })
  @Get('licenses/:id')
  findOne(@Param('id') id: string) {
    return this.licenses.findOne(id);
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Public()
  @ApiOperation({
    summary: 'QR verification of a license',
    description:
      'Minimal license payload for QR scanning. Rate limited to 60/min/IP.',
  })
  @ApiParam({ name: 'id', description: 'License uuid', format: 'uuid' })
  @ApiOkResponse({ description: 'Minimal license verification payload.' })
  @ApiNotFoundResponse({ description: 'License not found.' })
  @Get('licenses/:id/qr-verify')
  verifyQr(@Param('id') id: string) {
    return this.licenses.findOne(id, true);
  }
}
