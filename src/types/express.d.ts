import type {
  JuristicContext,
  JwtClaims,
  RequestScope,
} from '../common/auth.types';

declare global {
  namespace Express {
    // Override request.user with JwtClaims so guards/interceptors are typed
    // without per-site casts. JwtAuthGuard writes here after token verification.
    interface Request {
      user?: JwtClaims;
      scope?: RequestScope | null;
      juristicContext?: JuristicContext | null;
    }
  }
}

export {};
