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
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtClaims } from '../../common/auth.types';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Roles('supervisor', 'admin')
  @Post('trigger')
  trigger(
    @Query('agency', new ParseEnumPipe(Agency)) agency: Agency,
    @CurrentUser() user: JwtClaims,
  ) {
    return this.sync.trigger(agency, user);
  }

  @Roles('admin')
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
  @Get('status')
  status(@CurrentUser() user: JwtClaims, @Req() request: Request) {
    return this.sync.status(user, request.scope);
  }
}
