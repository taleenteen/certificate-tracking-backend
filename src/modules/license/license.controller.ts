import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtClaims } from '../../common/auth.types';
import {
  CreateLicenseTypeDto,
  PublicLicenseSearchDto,
  UpdateLicenseStatusDto,
  UpdateLicenseTypeDto,
} from './license.dto';
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

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Public()
  @ApiOperation({
    summary: 'Search public licenses by business name',
    description:
      'Public license search for citizens. Searches by business name (`q`) ' +
      'with optional license number filter (`licenseNumber`). No officer ' +
      'agency scope is applied because license data is public.',
  })
  @ApiOkResponse({ description: 'Paginated public license search results.' })
  @Get('licenses/search')
  searchPublic(@Query() query: PublicLicenseSearchDto) {
    return this.licenses.searchPublic(query);
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Public()
  @ApiOperation({
    summary: 'Search public licenses grouped by business',
    description:
      'Citizen-facing search that returns businesses/establishments first, ' +
      'with matching licenses nested under each business. Uses `q` for ' +
      'business name and optional `licenseNumber` for license number.',
  })
  @ApiOkResponse({
    description: 'Paginated businesses with nested matching licenses.',
  })
  @Get('licenses/search/grouped-by-business')
  searchPublicGroupedByBusiness(@Query() query: PublicLicenseSearchDto) {
    return this.licenses.searchPublicGroupedByBusiness(query);
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
    description:
      'Returns status codes with Thai display names and workflow metadata.',
  })
  @ApiOkResponse({ description: '{ licenseStatuses, taskStatuses } arrays.' })
  @Get('statuses')
  listStatuses() {
    return this.licenses.listStatuses();
  }

  @Roles('officer', 'admin', 'super_admin')
  @ApiOperation({ summary: 'Update license status (agency staff)' })
  @ApiParam({ name: 'id', description: 'License uuid', format: 'uuid' })
  @ApiOkResponse({ description: 'Updated license.' })
  @ApiNotFoundResponse({ description: 'License not found.' })
  @ApiConflictResponse({ description: 'Conflict of interest.' })
  @Patch('licenses/:id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateLicenseStatusDto,
    @CurrentUser() user: JwtClaims,
  ) {
    return this.licenses.updateStatus(id, dto, user);
  }

  @Public()
  @ApiOperation({
    summary: 'Get a license by id',
    description:
      'Public license detail including type, business, and documents with ' +
      'presigned URLs (10-min TTL). Includes ownership metadata without ' +
      'exposing personal citizen identity.',
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
    summary: 'Stream license certificate PDF (same-origin preview)',
    description:
      'Streams the first LICENSE_CERTIFICATE PDF for browser preview (pdf.js). ' +
      'Prefer this over MinIO presigned HTTP URLs to avoid CORS and mixed-content blocks.',
  })
  @ApiParam({ name: 'id', description: 'License uuid', format: 'uuid' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'Binary PDF body.' })
  @ApiNotFoundResponse({ description: 'License or certificate not found.' })
  @Get('licenses/:id/certificate')
  async streamCertificate(
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const file = await this.licenses.getCertificateFile(id);
    response
      .type(file.mimeType)
      .setHeader('Cache-Control', 'private, max-age=120')
      .setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(file.fileName)}"`,
      )
      // Allow pdf.js / canvas consumers on any frontend origin via BFF.
      .setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
      .send(file.buffer);
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Public()
  @ApiOperation({
    summary: 'QR verification of a license',
    description:
      'Minimal license payload for QR scanning, including ownership metadata. ' +
      'Rate limited to 60/min/IP.',
  })
  @ApiParam({ name: 'id', description: 'License uuid', format: 'uuid' })
  @ApiOkResponse({ description: 'Minimal license verification payload.' })
  @ApiNotFoundResponse({ description: 'License not found.' })
  @Get('licenses/:id/qr-verify')
  verifyQr(@Param('id') id: string) {
    return this.licenses.findOne(id, true);
  }
}
