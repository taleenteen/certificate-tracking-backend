import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';

export class TangRatLoginDto {
  @IsString()
  @IsNotEmpty()
  mToken!: string;
}

export class SelfLoginDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsString()
  @Length(6, 6)
  totpCode!: string;
}

export class RefreshDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  refreshToken?: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(12)
  newPassword!: string;
}

export class ForgotPasswordDto {
  @IsString()
  @IsNotEmpty()
  username!: string;
}

export class ResetPasswordDto extends ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsOptional()
  @IsString()
  username?: string;
}
