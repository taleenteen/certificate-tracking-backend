import { Agency } from '@prisma/client';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class UserQueryDto {
  @IsOptional()
  @IsIn(['public', 'inspector', 'supervisor', 'admin'])
  role?: string;

  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @IsOptional()
  @IsBoolean()
  status?: boolean;

  @IsOptional()
  @IsString()
  q?: string;
}

export class CreateUserDto {
  @IsString()
  fullName!: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsIn(['inspector', 'supervisor'], { each: true })
  roles!: string[];

  @IsEnum(Agency)
  agency!: Agency;

  @IsArray()
  @IsUUID('4', { each: true })
  zoneIds: string[] = [];
}

export class UpdateRolesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(['public', 'inspector', 'supervisor', 'admin'], { each: true })
  roles!: string[];
}

export class UpdateAgencyDto {
  @IsEnum(Agency)
  agency!: Agency;
}

export class UpdateZonesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  zoneIds!: string[];
}
