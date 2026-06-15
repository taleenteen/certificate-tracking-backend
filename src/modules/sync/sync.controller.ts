import {
  Controller,
  Get,
  ParseEnumPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Agency } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtClaims } from '../../common/auth.types';
import { SyncService } from './sync.service';

@ApiTags('Sync')
@ApiBearerAuth('access-token')
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Roles('supervisor', 'admin')
  @ApiOperation({
    summary: 'Trigger an agency sync',
    description:
      'Runs the (mock) GDX fetch for the agency and upserts licenses by ' +
      'license number. Rate limited to 1 per 5 min per agency. Supervisors ' +
      'may only sync their own agency.',
  })
  @ApiQuery({ name: 'agency', enum: Agency, description: 'Agency to sync.' })
  @ApiCreatedResponse({ description: 'The completed sync log.' })
  @Post('trigger')
  trigger(
    @Query('agency', new ParseEnumPipe(Agency)) agency: Agency,
    @CurrentUser() user: JwtClaims,
  ) {
    return this.sync.trigger(agency, user);
  }

  @Roles('admin')
  @ApiOperation({
    summary: 'Import DIW licenses from CSV (admin)',
    description:
      'Multipart CSV upload with columns: ' +
      '`license_no,business_name,type_code,issue_date,status`. Validates and ' +
      'upserts; recorded via a CSV_IMPORT audit entry.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiCreatedResponse({ description: 'Import result summary.' })
  @Post('import/diw')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  importDiw(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtClaims,
  ) {
    return this.sync.importDiw(file, user.sub);
  }

  @Roles('supervisor', 'admin')
  @ApiOperation({
    summary: 'Latest sync status per agency',
    description: 'Returns the most recent sync log for each agency.',
  })
  @ApiOkResponse({ description: 'Latest sync logs.' })
  @Get('status')
  status(@CurrentUser() user: JwtClaims, @Req() request: Request) {
    return this.sync.status(user, request.scope);
  }
}
