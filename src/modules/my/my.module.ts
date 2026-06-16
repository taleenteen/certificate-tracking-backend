import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExternalModule } from '../external/external.module';
import { MyController } from './my.controller';
import { MyService } from './my.service';

@Module({
  imports: [ExternalModule, AuthModule],
  controllers: [MyController],
  providers: [MyService],
})
export class MyModule {}
