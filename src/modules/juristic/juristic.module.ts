import { Module } from '@nestjs/common';
import { ExternalModule } from '../external/external.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { JuristicController } from './juristic.controller';
import { JuristicJoinRequestController } from './juristic-join-request.controller';
import { JuristicService } from './juristic.service';

@Module({
  imports: [PrismaModule, ExternalModule],
  controllers: [JuristicController, JuristicJoinRequestController],
  providers: [JuristicService],
})
export class JuristicModule {}
