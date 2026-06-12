import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Agency, AuthProvider, ClientType } from '@prisma/client';
import { ClientTypeGuard } from './client-type.guard';
import { ScopeGuard } from './scope.guard';

function context(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('security guards', () => {
  it('rejects admin claims from an app session', () => {
    const guard = new ClientTypeGuard();
    expect(() =>
      guard.canActivate(
        context({
          user: {
            sub: 'admin',
            jti: 'jti',
            roles: ['admin'],
            agency: null,
            zoneIds: [],
            authProvider: AuthProvider.self,
            clientType: ClientType.app,
          },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('derives inspector scope only from JWT claims', () => {
    const request = {
      query: { zoneId: 'client-controlled-zone' },
      user: {
        sub: 'inspector',
        jti: 'jti',
        roles: ['inspector'],
        agency: Agency.DIW,
        zoneIds: ['jwt-zone'],
        authProvider: AuthProvider.tang_rat,
        clientType: ClientType.app,
      },
    };
    expect(new ScopeGuard().canActivate(context(request))).toBe(true);
    expect(request).toMatchObject({
      scope: { agency: Agency.DIW, zoneIds: ['jwt-zone'] },
    });
  });
});
