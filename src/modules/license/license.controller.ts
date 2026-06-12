import { Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { LicenseService } from './license.service';

@Public()
@Controller()
export class LicenseController {
  constructor(private readonly licenses: LicenseService) {}

  @Get('license-types')
  listTypes() {
    return this.licenses.listTypes();
  }

  @Get('licenses/:id')
  findOne(@Param('id') id: string) {
    return this.licenses.findOne(id);
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('licenses/:id/qr-verify')
  verifyQr(@Param('id') id: string) {
    return this.licenses.findOne(id, true);
  }
}
