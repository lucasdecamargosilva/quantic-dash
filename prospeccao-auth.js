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

module.exports = { loadAccounts, isAuthorized };
