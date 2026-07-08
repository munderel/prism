import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function parseKeyHex(hex: string | undefined): Buffer {
  if (!hex || hex.length !== 64) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypt a plaintext token with an explicit 64-char hex key.
 * Returns "iv:authTag:ciphertext" in hex. App code should use encryptToken
 * (env-keyed); this variant exists for scripts/rotate-token-key.ts so key
 * rotation reuses the exact cipher code instead of duplicating it.
 */
export function encryptTokenWithKey(plaintext: string, keyHex: string): string {
  const key = parseKeyHex(keyHex);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Encrypt a plaintext token with TOKEN_ENCRYPTION_KEY. Returns "iv:authTag:ciphertext" in hex.
 */
export function encryptToken(plaintext: string): string {
  return encryptTokenWithKey(plaintext, process.env.TOKEN_ENCRYPTION_KEY ?? '');
}

/**
 * Decrypt a token encrypted by encryptToken, using an explicit 64-char hex
 * key. Returns null on any failure (wrong key, malformed input, bad key hex).
 * Used by scripts/rotate-token-key.ts.
 */
export function decryptTokenWithKey(encrypted: string, keyHex: string): string | null {
  try {
    const parts = encrypted.split(':');
    if (parts.length !== 3) return null;

    const [ivHex, authTagHex, ciphertext] = parts;
    const key = parseKeyHex(keyHex);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return null;
  }
}

/**
 * Decrypt a token encrypted by encryptToken with TOKEN_ENCRYPTION_KEY.
 * Returns null on failure.
 */
export function decryptToken(encrypted: string): string | null {
  return decryptTokenWithKey(encrypted, process.env.TOKEN_ENCRYPTION_KEY ?? '');
}
