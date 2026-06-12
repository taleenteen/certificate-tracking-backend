import { Module } from '@nestjs/common';
import { ExternalModule } from '../external/external.module';
import { MyController } from './my.controller';
import { MyService } from './my.service';

@Module({
  imports: [ExternalModule],
  controllers: [MyController],
  providers: [MyService],
})
export class MyModule {}
