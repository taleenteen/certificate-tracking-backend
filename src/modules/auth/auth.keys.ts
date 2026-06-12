import { generateKeyPairSync } from 'crypto';

let generatedKeys: { privateKey: string; publicKey: string } | undefined;

export function jwtKeys() {
  const privateKey = process.env.JWT_PRIVATE_KEY_BASE64
    ? Buffer.from(process.env.JWT_PRIVATE_KEY_BASE64, 'base64').toString('utf8')
    : undefined;
  const publicKey = process.env.JWT_PUBLIC_KEY_BASE64
    ? Buffer.from(process.env.JWT_PUBLIC_KEY_BASE64, 'base64').toString('utf8')
    : undefined;
  if (privateKey && publicKey) return { privateKey, publicKey };

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT RS256 keys are required in production');
  }
  // DECISION: ephemeral development keys avoid committing secrets.
  generatedKeys ??= generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return generatedKeys;
}
