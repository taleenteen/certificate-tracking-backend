import { Module } from '@nestjs/common';
import { ZoneController } from './zone.controller';
import { ZoneService } from './zone.service';

@Module({
  controllers: [ZoneController],
  providers: [ZoneService],
})
export class ZoneModule {}
