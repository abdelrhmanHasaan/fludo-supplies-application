"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashSecret = hashSecret;
exports.verifySecret = verifySecret;
exports.signToken = signToken;
exports.verifyToken = verifyToken;
exports.computeAuditRowHash = computeAuditRowHash;
const node_crypto_1 = __importDefault(require("node:crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const argon2_1 = __importDefault(require("argon2"));
const JWT_SECRET = process.env.JWT_SECRET || 'fludo-supplies-erp-local-secret-key-32-chars-min';
async function hashSecret(secret) {
    return await argon2_1.default.hash(secret, {
        type: argon2_1.default.argon2id,
        memoryCost: 65536, // 64 MB
        timeCost: 3,
        parallelism: 4,
    });
}
async function verifySecret(secret, combinedHash) {
    if (!secret || !combinedHash)
        return false;
    // Support Argon2id hashes
    if (combinedHash.startsWith('$argon2')) {
        try {
            return await argon2_1.default.verify(combinedHash, secret);
        }
        catch {
            return false;
        }
    }
    // Fallback for legacy scrypt hashes (salt:hash)
    if (combinedHash.includes(':')) {
        return new Promise((resolve) => {
            const [salt, key] = combinedHash.split(':');
            if (!salt || !key)
                return resolve(false);
            node_crypto_1.default.scrypt(secret, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
                if (err)
                    return resolve(false);
                const keyBuffer = Buffer.from(key, 'hex');
                resolve(node_crypto_1.default.timingSafeEqual(keyBuffer, derivedKey));
            });
        });
    }
    return false;
}
function signToken(payload) {
    return jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: '12h' });
}
function verifyToken(token) {
    try {
        return jsonwebtoken_1.default.verify(token, JWT_SECRET);
    }
    catch {
        return null;
    }
}
function computeAuditRowHash(prevHash, row) {
    const normalized = JSON.stringify(row, Object.keys(row).sort());
    const payload = `${prevHash || 'GENESIS'}|${normalized}`;
    return node_crypto_1.default.createHash('sha256').update(payload).digest('hex');
}
