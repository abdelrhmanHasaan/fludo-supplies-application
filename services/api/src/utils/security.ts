import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { argon2Verify } from 'hash-wasm';

const JWT_SECRET = process.env.JWT_SECRET || 'fludo-supplies-erp-local-secret-key-32-chars-min';

export async function hashSecret(secret: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.scrypt(secret, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

export async function verifySecret(secret: string, combinedHash: string): Promise<boolean> {
  if (!secret || !combinedHash) return false;

  // Support legacy or existing Argon2id hashes via pure WebAssembly
  if (combinedHash.startsWith('$argon2')) {
    try {
      return await argon2Verify({ password: secret, hash: combinedHash });
    } catch {
      return false;
    }
  }

  // Pure Node.js built-in scrypt hashes (salt:hash)
  if (combinedHash.includes(':')) {
    return new Promise((resolve) => {
      const [salt, key] = combinedHash.split(':');
      if (!salt || !key) return resolve(false);

      crypto.scrypt(secret, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
        if (err) return resolve(false);
        const keyBuffer = Buffer.from(key, 'hex');
        resolve(crypto.timingSafeEqual(keyBuffer, derivedKey));
      });
    });
  }

  return false;
}

export function signToken(payload: { userId: string; username: string; role: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
}

export function verifyToken(token: string): { userId: string; username: string; role: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; username: string; role: string };
  } catch {
    return null;
  }
}

export function computeAuditRowHash(prevHash: string | null, row: Record<string, any>): string {
  const normalized = JSON.stringify(row, Object.keys(row).sort());
  const payload = `${prevHash || 'GENESIS'}|${normalized}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}
