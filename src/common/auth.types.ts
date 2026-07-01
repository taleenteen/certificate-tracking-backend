import { AuthProvider, ClientType } from '@prisma/client';

export interface JwtClaims {
  sub: string;
  jti: string;
  roles: string[];
  agencyId: string | null;
  authProvider: AuthProvider;
  clientType: ClientType;
  citizenSub?: string;
  pwc?: boolean;
  // D5 (Tang Rat primary): convenience flag only — never include the ID or hash in the JWT (PII minimisation)
  hasCitizenId?: boolean;
  // Entry channel that minted the session (primary Tang Rat vs secondary domain)
  channel?: 'domain' | 'tang_rat';
  // D6: juristic context — only populated when session is in company mode
  activeJuristicId?: string;
  juristicRole?: 'OWNER' | 'ADMIN' | 'MEMBER';
}

export interface JuristicContext {
  juristicId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  userId: string;
}

export interface RequestScope {
  agencyId: string;
}
