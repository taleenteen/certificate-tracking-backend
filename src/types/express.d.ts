import type { JwtClaims, RequestScope } from '../common/auth.types';

declare global {
  namespace Express {
    interface Request {
      user?: JwtClaims;
      scope?: RequestScope | null;
    }
  }
}

export {};
