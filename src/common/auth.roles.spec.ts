import {
  canGrantRole,
  canManageUser,
  isAdminTier,
  maxRank,
  satisfiesRole,
} from './auth.roles';

describe('auth.roles hierarchy', () => {
  it('ranks roles low → high', () => {
    expect(maxRank(['public'])).toBeLessThan(maxRank(['officer']));
    expect(maxRank(['officer'])).toBeLessThan(maxRank(['admin']));
    expect(maxRank(['admin'])).toBeLessThan(maxRank(['super_admin']));
  });

  it('treats admin and super_admin as the admin tier', () => {
    expect(isAdminTier(['admin'])).toBe(true);
    expect(isAdminTier(['super_admin'])).toBe(true);
    expect(isAdminTier(['officer'])).toBe(false);
  });

  describe('satisfiesRole (higher inherits lower)', () => {
    it('lets admin reach officer-gated routes', () => {
      expect(satisfiesRole(['admin'], ['officer'])).toBe(true);
      expect(satisfiesRole(['super_admin'], ['admin'])).toBe(true);
      expect(satisfiesRole(['super_admin'], ['officer'])).toBe(true);
    });

    it('does not let lower roles reach higher-gated routes', () => {
      expect(satisfiesRole(['officer'], ['admin'])).toBe(false);
      expect(satisfiesRole(['admin'], ['super_admin'])).toBe(false);
      expect(satisfiesRole(['public'], ['officer'])).toBe(false);
    });
  });

  describe('canGrantRole', () => {
    it('only super_admin may grant admin / super_admin', () => {
      expect(canGrantRole(['super_admin'], 'admin')).toBe(true);
      expect(canGrantRole(['super_admin'], 'super_admin')).toBe(true);
      expect(canGrantRole(['admin'], 'admin')).toBe(false);
      expect(canGrantRole(['admin'], 'super_admin')).toBe(false);
    });

    it('admin may grant roles below admin', () => {
      expect(canGrantRole(['admin'], 'officer')).toBe(true);
      expect(canGrantRole(['admin'], 'public')).toBe(true);
    });
  });

  describe('canManageUser', () => {
    it('super_admin can manage anyone, including admins', () => {
      expect(canManageUser(['super_admin'], ['admin'])).toBe(true);
      expect(canManageUser(['super_admin'], ['super_admin'])).toBe(true);
    });

    it('admin cannot manage peers or super_admins', () => {
      expect(canManageUser(['admin'], ['admin'])).toBe(false);
      expect(canManageUser(['admin'], ['super_admin'])).toBe(false);
      expect(canManageUser(['admin'], ['officer'])).toBe(true);
    });
  });
});
