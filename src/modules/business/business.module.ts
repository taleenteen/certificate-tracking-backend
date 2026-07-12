import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { BusinessController } from './business.controller';
import { BusinessService } from './business.service';

@Module({
  controllers: [BusinessController],
  imports: [StorageModule],
  providers: [BusinessService],
})
export class BusinessModule {}
