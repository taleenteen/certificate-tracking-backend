import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AgencyModule } from './modules/agency/agency.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { BusinessModule } from './modules/business/business.module';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { ClientTypeGuard } from './common/guards/client-type.guard';
import { JuristicContextGuard } from './common/guards/juristic-context.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { ScopeGuard } from './common/guards/scope.guard';
import { ExternalModule } from './modules/external/external.module';
import { ExportModule } from './modules/export/export.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { InspectionModule } from './modules/inspection/inspection.module';
import { LicenseModule } from './modules/license/license.module';
import { LicenseDocumentExportModule } from './modules/license-document-export/license-document-export.module';
import { JuristicModule } from './modules/juristic/juristic.module';
import { MyModule } from './modules/my/my.module';
import { NotificationModule } from './modules/notification/notification.module';
import { OfficerModule } from './modules/officer/officer.module';
import { PrismaModule } from './prisma/prisma.module';
import { SyncModule } from './modules/sync/sync.module';
import { UserModule } from './modules/user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    ExternalModule,
    AgencyModule,
    AuthModule,
    LicenseModule,
    LicenseDocumentExportModule,
    BusinessModule,
    JuristicModule,
    MyModule,
    OfficerModule,
    NotificationModule,
    InspectionModule,
    DashboardModule,
    UserModule,
    SyncModule,
    AuditModule,
    ExportModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ClientTypeGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ScopeGuard },
    { provide: APP_GUARD, useClass: JuristicContextGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
