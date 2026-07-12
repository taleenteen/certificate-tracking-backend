import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExternalModule } from '../external/external.module';
import { StorageModule } from '../storage/storage.module';
import { MyController } from './my.controller';
import { MyService } from './my.service';

@Module({
  imports: [ExternalModule, AuthModule, StorageModule],
  controllers: [MyController],
  providers: [MyService],
})
export class MyModule {}
