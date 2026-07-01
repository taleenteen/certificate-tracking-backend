/**
 * Central role model. Roles are hierarchical: a higher-ranked role inherits all
 * powers of the roles below it.
 *
 *   public(0) < officer(1) < admin(2) < super_admin(3)
 *
 * - `super_admin`: manages all users and is the only role that can grant/revoke
 *   `admin` (and `super_admin`).
 * - `admin`: full operational access; can grant roles strictly below admin.
 * - `officer`: field officer — performs inspections, assigns tasks, approves
 *   reports; scoped to their agency.
 * - `public`: citizen/business read-only access.
 */
export type Role = 'public' | 'officer' | 'admin' | 'super_admin';

export const ROLE_RANK: Record<string, number> = {
  public: 0,
  officer: 1,
  admin: 2,
  super_admin: 3,
};

/** Roles that authenticate through the web admin portal (self-login). */
const ADMIN_TIER = new Set(['admin', 'super_admin']);

/** Highest rank held by the given roles (−1 if none recognised). */
export function maxRank(roles: string[]): number {
  return roles.reduce((max, role) => Math.max(max, ROLE_RANK[role] ?? -1), -1);
}

/** True when the user holds `admin` or `super_admin`. */
export function isAdminTier(roles: string[]): boolean {
  return roles.some((role) => ADMIN_TIER.has(role));
}

/**
 * Hierarchical check: the user satisfies a route requiring any of `required`
 * when their highest rank is at least the lowest required rank.
 */
export function satisfiesRole(
  userRoles: string[],
  required: string[],
): boolean {
  if (!required.length) return true;
  const need = Math.min(...required.map((role) => ROLE_RANK[role] ?? Infinity));
  return maxRank(userRoles) >= need;
}

/**
 * Whether `actorRoles` may grant `targetRole` to a user. super_admin may grant
 * any role; everyone else only roles strictly below their own rank (so an admin
 * cannot create admins or super_admins).
 */
export function canGrantRole(
  actorRoles: string[],
  targetRole: string,
): boolean {
  if (actorRoles.includes('super_admin')) return true;
  return (ROLE_RANK[targetRole] ?? Infinity) < maxRank(actorRoles);
}

/**
 * Whether `actorRoles` may modify a user holding `targetRoles` (change roles,
 * suspend, delete). super_admin may modify anyone; everyone else only users
 * ranked strictly below themselves (so admins cannot tamper with peers).
 */
export function canManageUser(
  actorRoles: string[],
  targetRoles: string[],
): boolean {
  if (actorRoles.includes('super_admin')) return true;
  return maxRank(targetRoles) < maxRank(actorRoles);
}
