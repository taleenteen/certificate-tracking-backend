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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtClaims } from '../../common/auth.types';
import { ExportService } from './export.service';

@Controller()
export class ExportController {
  constructor(private readonly exports: ExportService) {}

  @Roles('admin')
  @Get('audit-logs/export')
  async audit(@Query('format') format: string, @Res() response: Response) {
    const file = await this.exports.audit(format);
    response.type(file.contentType).attachment(file.fileName).send(file.buffer);
  }

  @Roles('supervisor', 'admin')
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
