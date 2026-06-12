import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { LicenseController } from './license.controller';
import { LicenseCron } from './license.cron';
import { LicenseService } from './license.service';

@Module({
  imports: [StorageModule],
  controllers: [LicenseController],
  providers: [LicenseService, LicenseCron],
  exports: [LicenseService],
})
export class LicenseModule {}
