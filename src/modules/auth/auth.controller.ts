import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SkipAudit } from '../../common/decorators/skip-audit.decorator';
import { JwtClaims } from '../../common/auth.types';
import {
  AuthTokenResponseDto,
  ChangePasswordDto,
  ContextSwitchResponseDto,
  DgaOidcAuthorizeDto,
  DgaOidcAuthorizeResponseDto,
  DgaOidcCallbackDto,
  ForgotPasswordDto,
  LoginDto,
  LogoutResponseDto,
  MessageResponseDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  SelfLoginDto,
  SwitchContextDto,
  TangRatLoginDto,
} from './auth.dto';
import { AuthService } from './auth.service';

@ApiTags('Auth')
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
      const maxAgeSeconds =
        'refreshTokenExpiresInSeconds' in result &&
        typeof result.refreshTokenExpiresInSeconds === 'number'
          ? result.refreshTokenExpiresInSeconds
          : 7 * 24 * 60 * 60;
      response.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/api/auth',
        maxAge: maxAgeSeconds * 1000,
      });
    }
    return result;
  }

  @Public()
  @SkipAudit()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Register a public account (email + password)',
    description:
      'Public self-signup. Creates a read-only `public` user with a ' +
      'bcrypt-hashed password (cost 12) and immediately issues access + ' +
      'refresh tokens (signup logs you in). Username must be unique. ' +
      'Rate limited to 5/min/IP.',
  })
  @ApiCreatedResponse({
    description: 'Account created; tokens issued.',
    type: AuthTokenResponseDto,
  })
  @ApiConflictResponse({ description: 'Username is already taken.' })
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.setRefreshCookie(
      response,
      await this.auth.register(dto, this.metadata(request)),
    );
  }

  @Public()
  @SkipAudit()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login with username + password (PUBLIC)',
    description:
      'Password login for self-registered public users. Admin accounts must ' +
      'use `POST /auth/self` (password + TOTP). Account locks for 15 min ' +
      'after 5 failures. Rate limited to 10/min/IP.',
  })
  @ApiOkResponse({ type: AuthTokenResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials.' })
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.setRefreshCookie(
      response,
      await this.auth.passwordLogin(
        dto.username,
        dto.password,
        this.metadata(request),
      ),
    );
  }

  @Public()
  @SkipAudit()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Login via ทางรัฐ mToken (PUBLIC / OFFICER)',
    description:
      'Verifies the mToken with the Tang Rat provider, finds or creates the ' +
      'user, and issues access + refresh tokens. Sets the refresh token as an ' +
      'httpOnly cookie.',
  })
  @ApiOkResponse({ type: AuthTokenResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid mToken or inactive user.' })
  @Post('tang-rat')
  async tangRat(
    @Body() dto: TangRatLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.setRefreshCookie(
      response,
      await this.auth.tangRatLogin(
        dto.mToken,
        this.metadata(request),
        dto.appId,
      ),
    );
  }

  @Public()
  @SkipAudit()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create DGA Digital ID OIDC authorize URL',
    description:
      'Creates a signed 10-minute OIDC state and returns the DGA authorize URL. ' +
      'Frontend redirects the user to `authorizeUrl`, stores `state`, then sends ' +
      '`code` and `state` to `/auth/dga/callback` after DGA redirects back.',
  })
  @ApiOkResponse({ type: DgaOidcAuthorizeResponseDto })
  @Post('dga/authorize')
  dgaAuthorize(@Body() dto: DgaOidcAuthorizeDto) {
    return this.auth.createDgaOidcAuthorizeUrl(dto);
  }

  @Public()
  @SkipAudit()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login with DGA Digital ID OIDC code',
    description:
      'Validates the signed state, exchanges the authorization code for a mock ' +
      'DGA access token, reads UserInfo, then issues this API access + refresh ' +
      'tokens. Token and UserInfo exchange are backend-only.',
  })
  @ApiOkResponse({ type: AuthTokenResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Invalid authorization code or UserInfo token.',
  })
  @Post('dga/callback')
  async dgaCallback(
    @Body() dto: DgaOidcCallbackDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.setRefreshCookie(
      response,
      await this.auth.dgaOidcCallback(dto, this.metadata(request)),
    );
  }

  @Public()
  @SkipAudit()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Login with username + password + TOTP (ADMIN only)',
    description:
      'Admin self-login. On first login (mustChangePassword) returns a ' +
      '`tempToken` and `requiresPasswordChange: true` instead of tokens. ' +
      'Rate limited to 10/min/IP. Account locks for 15 min after 5 failures.',
  })
  @ApiOkResponse({
    description: 'Tokens, or a password-change challenge on first login.',
    type: AuthTokenResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials or TOTP.' })
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
  @ApiOperation({
    summary: 'Rotate the refresh token',
    description:
      'Issues a new access + refresh token pair and revokes the old session ' +
      '(rotation). Replaying an already-rotated token is treated as theft and ' +
      'revokes all of the user’s sessions. Token may come from the body or ' +
      'the `refreshToken` cookie.',
  })
  @ApiOkResponse({ type: AuthTokenResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Missing, expired, or reused token.',
  })
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
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Logout',
    description:
      'Revokes the current session. mToken sessions are owned by Tang Rat and ' +
      'return `logoutAllowed=false` without revoking the app-managed session.',
  })
  @ApiOkResponse({ type: LogoutResponseDto })
  @Post('logout')
  logout(@CurrentUser() user: JwtClaims, @Req() request: Request) {
    return this.auth.logout(user, this.metadata(request));
  }

  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Change password',
    description:
      'Sets a new password and revokes all other sessions. Accepts either a ' +
      'normal access token or the 5-min `tempToken` from first-login.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
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
  @ApiOperation({
    summary: 'Request a password reset link',
    description:
      'Creates a single-use 15-min reset token (logged to console in the ' +
      'mock). Always returns success to avoid user enumeration. Limited to ' +
      '3/hour per user.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @Post('forgot-password')
  forgot(@Body() dto: ForgotPasswordDto, @Ip() ipAddress: string) {
    return this.auth.forgotPassword(dto.username, ipAddress);
  }

  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Switch session into a juristic company context (D6)',
    description:
      'Re-mints the access token with juristic context claims ' +
      '(`activeJuristicId`, `juristicRole`). Pass `juristicId: null` to return ' +
      'to personal/user mode. Reuses the existing session; no new refresh token. ' +
      'The old access token JTI is revoked immediately.',
  })
  @ApiOkResponse({ type: ContextSwitchResponseDto })
  @ApiUnauthorizedResponse({ description: 'Session not found or expired.' })
  @Post('context')
  switchContext(
    @CurrentUser() user: JwtClaims,
    @Body() dto: SwitchContextDto,
    @Req() request: Request,
  ) {
    return this.auth.switchContext(
      user,
      dto.juristicId ?? null,
      this.metadata(request),
    );
  }

  @Public()
  @SkipAudit()
  @ApiOperation({
    summary: 'Reset password with a token',
    description: 'Consumes the single-use token and sets the new password.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @Post('reset-password')
  reset(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.newPassword);
  }
}
