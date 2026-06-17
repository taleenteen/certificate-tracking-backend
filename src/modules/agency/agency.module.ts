import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AgencyController } from './agency.controller';
import { AgencyService } from './agency.service';

@Module({
  imports: [PrismaModule],
  controllers: [AgencyController],
  providers: [AgencyService],
  exports: [AgencyService],
})
export class AgencyModule {}
