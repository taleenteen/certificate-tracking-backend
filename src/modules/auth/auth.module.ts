import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ExternalModule } from '../external/external.module';
import { AuthController } from './auth.controller';
import { jwtKeys } from './auth.keys';
import { AuthService } from './auth.service';
import { SessionCleanupService } from './session-cleanup.service';

@Module({
  imports: [
    ExternalModule,
    JwtModule.register({
      global: true,
      privateKey: jwtKeys().privateKey,
      publicKey: jwtKeys().publicKey,
      signOptions: { algorithm: 'RS256' },
      verifyOptions: { algorithms: ['RS256'] },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SessionCleanupService],
  exports: [AuthService],
})
export class AuthModule {}
