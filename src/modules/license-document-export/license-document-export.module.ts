import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { LicenseDocumentExportController } from './license-document-export.controller';
import { LicenseDocumentExportService } from './license-document-export.service';

@Module({
  imports: [StorageModule],
  controllers: [LicenseDocumentExportController],
  providers: [LicenseDocumentExportService],
})
export class LicenseDocumentExportModule {}
