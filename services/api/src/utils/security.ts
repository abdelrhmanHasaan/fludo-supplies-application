import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fludo-supplies-erp-local-secret-key-32-chars-min';

export function hashSecret(secret: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(secret, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

export function verifySecret(secret: string, combinedHash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, key] = combinedHash.split(':');
    if (!salt || !key) return resolve(false);

    crypto.scrypt(secret, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
      if (err) return reject(err);
      const keyBuffer = Buffer.from(key, 'hex');
      resolve(crypto.timingSafeEqual(keyBuffer, derivedKey));
    });
  });
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

