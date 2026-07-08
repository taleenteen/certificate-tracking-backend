import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtClaims } from '../../common/auth.types';
import {
  CreateOfficerInspectionDto,
  OfficerInspectionExportQueryDto,
  OfficerInspectionListQueryDto,
  OfficerInspectionLogQueryDto,
  OfficerLicenseQueryDto,
} from './officer.dto';
import { OfficerService } from './officer.service';

@ApiTags('Officer')
@ApiBearerAuth('access-token')
@Controller()
export class OfficerController {
  constructor(private readonly officers: OfficerService) {}

  @Roles('officer')
  @ApiOperation({
    summary: 'Search licenses for officer inspection',
    description:
      'Officers can search reportable licenses across agencies. ' +
      'Use agencyId only as an optional license-agency filter.',
  })
  @ApiOkResponse({
    description: 'Paginated license results for field reports.',
  })
  @Get('officer/licenses')
  listLicenses(@Query() query: OfficerLicenseQueryDto) {
    return this.officers.listLicenses(query);
  }

  @Roles('officer')
  @ApiOperation({
    summary: 'Create an officer inspection report batch',
    description:
      'Creates one submitted inspection batch for one business with 1-50 ' +
      'license-level report items. Evidence is uploaded per item afterwards.',
  })
  @ApiCreatedResponse({
    description: 'Created inspection summary with item ids.',
  })
  @ApiForbiddenResponse({ description: 'Officer role or agency missing.' })
  @ApiNotFoundResponse({ description: 'Business or license not found.' })
  @ApiUnprocessableEntityResponse({ description: 'Invalid report payload.' })
  @Post('officer/inspections')
  createInspection(
    @Body() dto: CreateOfficerInspectionDto,
    @CurrentUser() user: JwtClaims,
  ) {
    return this.officers.createInspection(dto, user);
  }

  @Roles('officer')
  @ApiOperation({
    summary: 'List own officer inspection reports',
    description:
      'Returns the logged-in officer inspection history. Admin/super_admin ' +
      'should use the admin log endpoint for cross-officer review.',
  })
  @ApiOkResponse({ description: 'Paginated officer inspection reports.' })
  @Get('officer/inspections')
  listInspections(
    @Query() query: OfficerInspectionListQueryDto,
    @CurrentUser() user: JwtClaims,
  ) {
    return this.officers.listInspections(query, user);
  }

  @Roles('officer')
  @ApiOperation({
    summary: 'Upload temporary evidence for officer inspection batch',
    description:
      'Multipart upload. Max 10 MB; allowed types: image/jpeg, image/png, ' +
      'application/pdf. Uploads to temporary storage and returns metadata ' +
      'to be included in the batch creation JSON.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiCreatedResponse({ description: 'Temporary uploaded file metadata.' })
  @ApiUnprocessableEntityResponse({
    description: 'Invalid file or limit exceeded.',
  })
  @Post('officer/inspections/upload')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadTempEvidence(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtClaims,
  ) {
    return this.officers.uploadTempEvidence(file, user);
  }

  @Roles('officer')
  @ApiOperation({
    summary: 'Upload evidence for one officer inspection item',
    description:
      'Multipart upload. Max 10 MB; allowed types: image/jpeg, image/png, ' +
      'application/pdf. Stored privately and returned as a presigned URL.',
  })
  @ApiParam({
    name: 'inspectionId',
    description: 'Inspection uuid',
    format: 'uuid',
  })
  @ApiParam({
    name: 'itemId',
    description: 'Inspection item uuid',
    format: 'uuid',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiCreatedResponse({ description: 'Created evidence metadata.' })
  @ApiNotFoundResponse({ description: 'Inspection or item not found.' })
  @ApiUnprocessableEntityResponse({ description: 'Invalid evidence file.' })
  @Post('officer/inspections/:inspectionId/items/:itemId/evidence')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadEvidence(
    @Param('inspectionId') inspectionId: string,
    @Param('itemId') itemId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtClaims,
  ) {
    return this.officers.uploadEvidence(inspectionId, itemId, user, file);
  }

  @Roles('officer')
  @ApiOperation({
    summary: 'Get officer inspection detail',
    description:
      'Creating officer can read their own report; admin/super_admin can read all.',
  })
  @ApiParam({ name: 'id', description: 'Inspection uuid', format: 'uuid' })
  @ApiOkResponse({
    description: 'Inspection detail with items and evidence URLs.',
  })
  @ApiNotFoundResponse({ description: 'Inspection not found.' })
  @Get('officer/inspections/:id')
  findInspection(@Param('id') id: string, @CurrentUser() user: JwtClaims) {
    return this.officers.findInspection(id, user);
  }

  @Roles('officer')
  @ApiOperation({
    summary: 'Export an officer inspection',
    description:
      'Streams PDF or XLSX generated from stored report snapshots and records ' +
      'an EXPORT audit row.',
  })
  @ApiParam({ name: 'id', description: 'Inspection uuid', format: 'uuid' })
  @ApiProduces(
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @ApiOkResponse({ description: 'Binary file attachment.' })
  @Get('officer/inspections/:id/export')
  async exportInspection(
    @Param('id') id: string,
    @Query() query: OfficerInspectionExportQueryDto,
    @CurrentUser() user: JwtClaims,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const file = await this.officers.exportInspection(
      id,
      query,
      user,
      request.ip,
      request.headers['user-agent'],
    );
    response.type(file.contentType).attachment(file.fileName).send(file.buffer);
  }

  @Roles('admin')
  @ApiOperation({
    summary: 'List officer inspection logs for admin review',
    description:
      'Admin/super_admin review field inspection history by officer, business, ' +
      'license, and date range.',
  })
  @ApiOkResponse({ description: 'Paginated officer inspection log entries.' })
  @Get('admin/officer-inspection-logs')
  listInspectionLogs(@Query() query: OfficerInspectionLogQueryDto) {
    return this.officers.listInspectionLogs(query);
  }

  @Roles('officer')
  @ApiOperation({
    summary: 'Get officer QR profile token',
    description:
      'Officer can generate their own QR profile; admin/super_admin can ' +
      'generate for any officer.',
  })
  @ApiParam({ name: 'id', description: 'Officer uuid', format: 'uuid' })
  @ApiOkResponse({ description: 'QR token and public verification URL.' })
  @ApiForbiddenResponse({ description: 'Cannot read this officer profile.' })
  @ApiNotFoundResponse({ description: 'Officer not found.' })
  @Get('officers/:id/qr-profile')
  getQrProfile(@Param('id') id: string, @CurrentUser() user: JwtClaims) {
    return this.officers.getQrProfile(id, user);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Public QR verification for an officer profile',
    description:
      'No auth required. Returns public-safe officer identity, agency, scan ' +
      'time, and inspection authority. Logs every scan attempt.',
  })
  @ApiParam({ name: 'token', description: 'Opaque officer QR token' })
  @ApiOkResponse({ description: 'Officer verification result.' })
  @Get('public/officers/verify/:token')
  verifyOfficer(@Param('token') token: string, @Req() request: Request) {
    return this.officers.verifyOfficerToken(
      token,
      request.ip,
      request.headers['user-agent'],
    );
  }
}
