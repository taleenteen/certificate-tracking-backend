/**
 * D5 citizen ID helpers (Tang Rat primary).
 *
 * Owner decision (2026-06-15): The citizen ID is stored **as plaintext**
 * (the raw 13-digit value) in the `citizenId` column for searchability,
 * data integrity, and direct integration with government systems.
 *
 * Protection comes from Database TDE + application RBAC + audit logging.
 * We do **not** use irreversible hashing for the stored value.
 *
 * The Prisma field remains named `citizenId` (column `citizen_id_hash`)
 * because renaming Prisma schema fields is prohibited by Golden Rule.
 * All documentation and code comments make the actual semantics explicit.
 */

// Pepper is no longer used for citizen ID storage (kept only for backward
// compatibility or future non-citizen use). The guard stays so old .env files
// don't break noisily.
const PEPPER =
  process.env.CITIZEN_ID_PEPPER ||
  (process.env.NODE_ENV !== 'production'
    ? 'dev-only-insecure-pepper-for-tests-and-seed-do-not-use-in-prod-32b!'
    : null);

if (!PEPPER && process.env.NODE_ENV === 'production') {
  // Only require in prod if someone still has the var expected.
  // In practice for citizen ID we no longer need it.
}

export function normalizeCitizenId(raw: string): string {
  return raw.replace(/[\s-]/g, '');
}

/**
 * Thai national ID (citizen ID) checksum validation.
 * 13 digits; weighted sum check digit.
 */
export function isValidThaiCitizenId(raw: string): boolean {
  const s = normalizeCitizenId(raw);
  if (!/^\d{13}$/.test(s)) return false;
  const d = s.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += d[i] * (13 - i);
  const check = (11 - (sum % 11)) % 10;
  return check === d[12];
}

export function last4(raw: string): string {
  return normalizeCitizenId(raw).slice(-4);
}

/**
 * Returns the normalized plaintext citizen ID (ready to store in citizenId).
 * Validation is mandatory. See schema comments for full owner decision rationale.
 */
export function storeCitizenId(raw: string): string {
  const norm = normalizeCitizenId(raw);
  if (!isValidThaiCitizenId(raw)) {
    throw new Error('Invalid Thai citizen ID (checksum failed)');
  }
  return norm; // plaintext per owner decision (2026-06-15)
}

/**
 * @deprecated
 * Alias that returns plaintext (same as storeCitizenId).
 * Name preserved only for transition / backward compatibility in call sites.
 * Prefer `storeCitizenId` in new code.
 */
export function hashCitizenId(raw: string): string {
  return storeCitizenId(raw);
}
