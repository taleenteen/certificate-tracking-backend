import { Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { LicenseService } from './license.service';

@ApiTags('Licenses')
@Public()
@Controller()
export class LicenseController {
  constructor(private readonly licenses: LicenseService) {}

  @ApiOperation({
    summary: 'List license types (master data)',
    description: 'Returns all active license types across both agencies.',
  })
  @ApiOkResponse({ description: 'Array of license types.' })
  @Get('license-types')
  listTypes() {
    return this.licenses.listTypes();
  }

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
