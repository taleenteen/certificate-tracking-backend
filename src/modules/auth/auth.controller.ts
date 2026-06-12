import {
  Body,
  Controller,
  Ip,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SkipAudit } from '../../common/decorators/skip-audit.decorator';
import { JwtClaims } from '../../common/auth.types';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  RefreshDto,
  ResetPasswordDto,
  SelfLoginDto,
  TangRatLoginDto,
} from './auth.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private metadata(request: Request) {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    };
  }

  private setRefreshCookie(response: Response, result: unknown) {
    if (
      result &&
      typeof result === 'object' &&
      'refreshToken' in result &&
      typeof result.refreshToken === 'string'
    ) {
      response.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/api/auth',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }
    return result;
  }

  @Public()
  @SkipAudit()
  @Post('tang-rat')
  async tangRat(
    @Body() dto: TangRatLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.setRefreshCookie(
      response,
      await this.auth.tangRatLogin(dto.mToken, this.metadata(request)),
    );
  }

  @Public()
  @SkipAudit()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('self')
  async self(
    @Body() dto: SelfLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.setRefreshCookie(
      response,
      await this.auth.selfLogin(
        dto.username,
        dto.password,
        dto.totpCode,
        this.metadata(request),
      ),
    );
  }

  @Public()
  @SkipAudit()
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const cookieToken = (request.cookies as Record<string, unknown> | undefined)
      ?.refreshToken;
    const refreshToken =
      dto.refreshToken ??
      (typeof cookieToken === 'string' ? cookieToken : undefined);
    if (!refreshToken) throw new UnauthorizedException();
    return this.setRefreshCookie(
      response,
      await this.auth.refresh(refreshToken, this.metadata(request)),
    );
  }

  @SkipAudit()
  @Post('logout')
  logout(@CurrentUser() user: JwtClaims, @Req() request: Request) {
    return this.auth.logout(user, this.metadata(request));
  }

  @Post('change-password')
  changePassword(
    @CurrentUser() user: JwtClaims,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(user, dto.newPassword);
  }

  @Public()
  @SkipAudit()
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @Post('forgot-password')
  forgot(@Body() dto: ForgotPasswordDto, @Ip() ipAddress: string) {
    return this.auth.forgotPassword(dto.username, ipAddress);
  }

  @Public()
  @SkipAudit()
  @Post('reset-password')
  reset(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.newPassword);
  }
}
