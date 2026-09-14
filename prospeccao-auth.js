const crypto = require('crypto');

const HASH_PATTERN = /^[a-f0-9]{64}$/;

function loadAccounts(env = process.env) {
    const accounts = [];
    const legacyUser = env.PROSPECCAO_USER || '';
    const legacyHash = env.PROSPECCAO_PASSWORD_HASH || '';
    if (legacyUser && HASH_PATTERN.test(legacyHash)) {
        accounts.push([legacyUser, legacyHash]);
    }

    const extra = env.PROSPECCAO_USERS_JSON;
    if (!extra) return accounts;

    let parsed;
    try {
        parsed = JSON.parse(extra);
    } catch (_) {
        throw new Error('PROSPECCAO_USERS_JSON deve ser um objeto JSON válido');
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new Error('PROSPECCAO_USERS_JSON deve ser um objeto de usuários e hashes');
    }

    for (const [user, hash] of Object.entries(parsed)) {
        if (!user || user.includes(':') || typeof hash !== 'string' || !HASH_PATTERN.test(hash)) {
            throw new Error('PROSPECCAO_USERS_JSON contém uma credencial inválida');
        }
        if (accounts.some(([existing]) => existing === user)) {
            throw new Error('PROSPECCAO_USERS_JSON contém um usuário duplicado');
        }
        accounts.push([user, hash]);
    }
    return accounts;
}

function safeEqual(a, b) {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function isAuthorized(header, accounts) {
    if (typeof header !== 'string' || !header.startsWith('Basic ')) return false;
    const encoded = header.slice(6);
    if (!encoded || encoded.length > 4096) return false;

    let decoded;
    try {
        decoded = Buffer.from(encoded, 'base64').toString('utf8');
    } catch (_) {
        return false;
    }
    const separator = decoded.indexOf(':');
    if (separator < 1) return false;
    const user = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    const hash = crypto.createHash('sha256').update(password, 'utf8').digest('hex');

    let authorized = false;
    for (const [expectedUser, expectedHash] of accounts) {
        const userMatches = safeEqual(user, expectedUser);
        const hashMatches = safeEqual(hash, expectedHash);
        authorized = (userMatches && hashMatches) || authorized;
    }
    return authorized;
}

function createSession(user, secret, now = Date.now()) {
    const payload = Buffer.from(JSON.stringify({ user, exp: now + 7 * 24 * 60 * 60 * 1000 })).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    return `${payload}.${signature}`;
}

function readSession(token, secret, accounts, now = Date.now(), revokedBefore = {}) {
    if (typeof token !== 'string' || token.length > 2048) return null;
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra) return null;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    if (!safeEqual(signature, expected)) return null;
    try {
        const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (typeof session.user !== 'string' || !Number.isFinite(session.exp) || session.exp <= now) return null;
        const cutoff = revokedBefore[session.user];
        if (Number.isFinite(cutoff) && session.exp - 7 * 24 * 60 * 60 * 1000 <= cutoff) return null;
        return accounts.some(([user]) => safeEqual(user, session.user)) ? session.user : null;
    } catch (_) {
        return null;
    }
}

module.exports = { loadAccounts, isAuthorized, createSession, readSession };
