import { Agency, AuthProvider, ClientType } from '@prisma/client';

export interface JwtClaims {
  sub: string;
  jti: string;
  roles: string[];
  agency: Agency | null;
  zoneIds: string[];
  authProvider: AuthProvider;
  clientType: ClientType;
  citizenSub?: string;
  pwc?: boolean;
}

export interface RequestScope {
  zoneIds: string[];
  agency: Agency;
}
