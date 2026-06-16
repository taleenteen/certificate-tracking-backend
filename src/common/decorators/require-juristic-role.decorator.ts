import { SetMetadata } from '@nestjs/common';

export const REQUIRE_JURISTIC_ROLE_KEY = 'require_juristic_role';

export const RequireJuristicRole = (role: 'OWNER' | 'ADMIN' | 'MEMBER') =>
  SetMetadata(REQUIRE_JURISTIC_ROLE_KEY, role);
