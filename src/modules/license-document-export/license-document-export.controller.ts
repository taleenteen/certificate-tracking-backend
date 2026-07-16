import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
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
import { JwtClaims } from '../../common/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipAudit } from '../../common/decorators/skip-audit.decorator';
import {
  CreateLicenseDocumentExportDto,
  LicenseDocumentExportQueryDto,
} from './license-document-export.dto';
import { LicenseDocumentExportService } from './license-document-export.service';

@ApiTags('License document exports')
@ApiBearerAuth('access-token')
@Controller()
export class LicenseDocumentExportController {
  constructor(private readonly exports: LicenseDocumentExportService) {}

  @Roles('officer')
  @SkipAudit()
  @ApiOperation({
    summary: 'Export selected establishment license documents',
    description:
      'Creates a verifiable PDF, XLSX, or CSV for selected licenses under one ' +
      'establishment. The server records an immutable export snapshot and audit row.',
  })
  @ApiParam({
    name: 'businessId',
    description: 'Business uuid',
    format: 'uuid',
  })
  @ApiProduces(
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
  )
  @ApiOkResponse({ description: 'Binary file attachment.' })
  @ApiCreatedResponse({
    description:
      'Native Tang Rat delivery returns a private, 10-minute download URL.',
  })
  @ApiForbiddenResponse({
    description: 'Officer cannot export the selected licenses.',
  })
  @ApiNotFoundResponse({
    description: 'Business or selected license not found.',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Invalid export selection or source documents.',
  })
  @Post('officer/businesses/:businessId/license-document-exports')
  async create(
    @Param('businessId') businessId: string,
    @Body() dto: CreateLicenseDocumentExportDto,
    @CurrentUser() user: JwtClaims,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const file = await this.exports.create(
      businessId,
      dto,
      user,
      request.ip,
      request.headers['user-agent'],
    );
    if (dto.delivery === 'native') {
      return response.status(201).json({
        id: file.exportId,
        referenceNo: file.referenceNo,
        fileName: file.fileName,
        contentType: file.contentType,
        downloadUrl: await this.exports.presign(file.objectKey),
        downloadUrlExpiresInSeconds: 600,
      });
    }
    response.type(file.contentType).attachment(file.fileName).send(file.buffer);
  }

  @Roles('officer')
  @ApiOperation({
    summary: 'List establishment license-document export history',
    description:
      'Officers see their own exports; admin tiers can review all completed ' +
      'exports, optionally filtered by establishment.',
  })
  @ApiOkResponse({ description: 'Paginated export history.' })
  @Get('officer/license-document-exports')
  list(
    @Query() query: LicenseDocumentExportQueryDto,
    @CurrentUser() user: JwtClaims,
  ) {
    return this.exports.list(query, user);
  }

  @Roles('officer')
  @SkipAudit()
  @ApiOperation({ summary: 'Download a previously generated export file' })
  @ApiParam({ name: 'id', description: 'Export uuid', format: 'uuid' })
  @ApiOkResponse({ description: 'Binary file attachment.' })
  @ApiNotFoundResponse({ description: 'Export not found.' })
  @Get('officer/license-document-exports/:id/file')
  async file(
    @Param('id') id: string,
    @CurrentUser() user: JwtClaims,
    @Res() response: Response,
  ) {
    const file = await this.exports.file(id, user);
    response.type(file.contentType).attachment(file.fileName).send(file.buffer);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Verify an exported license document',
    description:
      'Public QR verification endpoint. Returns export metadata and the ' +
      'snapshot only; it never exposes the private file itself.',
  })
  @ApiParam({
    name: 'verificationCode',
    description: 'Opaque QR verification code',
  })
  @ApiOkResponse({ description: 'Verified export metadata.' })
  @ApiNotFoundResponse({ description: 'Verification code not found.' })
  @Get('public/license-document-exports/:verificationCode')
  verify(@Param('verificationCode') verificationCode: string) {
    return this.exports.verify(verificationCode);
  }
}
