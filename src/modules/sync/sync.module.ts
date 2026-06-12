import { Module } from '@nestjs/common';
import { ExternalModule } from '../external/external.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [ExternalModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
