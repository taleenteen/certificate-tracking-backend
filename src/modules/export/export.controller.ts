import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtClaims } from '../../common/auth.types';
import { ExportService } from './export.service';

@ApiTags('Export')
@ApiBearerAuth('access-token')
@Controller()
export class ExportController {
  constructor(private readonly exports: ExportService) {}

  @Roles('admin')
  @ApiOperation({
    summary: 'Export audit logs (admin)',
    description: 'Streams the audit log as a downloadable PDF or XLSX file.',
  })
  @ApiQuery({
    name: 'format',
    enum: ['pdf', 'xlsx'],
    description: 'File format.',
  })
  @ApiProduces(
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @ApiOkResponse({ description: 'Binary file attachment.' })
  @Get('audit-logs/export')
  async audit(@Query('format') format: string, @Res() response: Response) {
    const file = await this.exports.audit(format);
    response.type(file.contentType).attachment(file.fileName).send(file.buffer);
  }

  @Roles('supervisor', 'admin')
  @ApiOperation({
    summary: 'Export an inspection report (supervisor/admin)',
    description:
      'Streams a single inspection report as PDF or XLSX. Scoped to the ' +
      'caller (supervisor: zone + agency).',
  })
  @ApiParam({ name: 'id', description: 'Report uuid', format: 'uuid' })
  @ApiQuery({
    name: 'format',
    enum: ['pdf', 'xlsx'],
    description: 'File format.',
  })
  @ApiProduces(
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @ApiOkResponse({ description: 'Binary file attachment.' })
  @Get('inspection-reports/:id/export')
  async report(
    @Param('id') id: string,
    @Query('format') format: string,
    @CurrentUser() user: JwtClaims,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const file = await this.exports.report(id, format, user, request.scope);
    if (!file) throw new NotFoundException();
    response.type(file.contentType).attachment(file.fileName).send(file.buffer);
  }
}
