import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { OfficerController } from './officer.controller';
import { OfficerService } from './officer.service';

@Module({
  imports: [StorageModule],
  controllers: [OfficerController],
  providers: [OfficerService],
})
export class OfficerModule {}
