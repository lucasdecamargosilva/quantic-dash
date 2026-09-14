const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { loadAccounts, isAuthorized, createSession, readSession } = require('../prospeccao-auth');

const hash = (password) => crypto.createHash('sha256').update(password).digest('hex');
const basic = (user, password) => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

test('mantém o acesso existente e aceita uma credencial individual', () => {
    const accounts = loadAccounts({
        PROSPECCAO_USER: 'lucas',
        PROSPECCAO_PASSWORD_HASH: hash('senha-lucas'),
        PROSPECCAO_USERS_JSON: JSON.stringify({ dione: hash('senha-dione') }),
    });

    assert.equal(isAuthorized(basic('lucas', 'senha-lucas'), accounts), true);
    assert.equal(isAuthorized(basic('dione', 'senha-dione'), accounts), true);
    assert.equal(isAuthorized(basic('dione', 'senha-lucas'), accounts), false);
    assert.equal(isAuthorized(basic('lucas', 'senha-dione'), accounts), false);
    assert.equal(isAuthorized(undefined, accounts), false);
});

test('sem credenciais configuradas, o painel fica fechado', () => {
    assert.equal(isAuthorized(basic('dione', 'senha-dione'), loadAccounts({})), false);
});

test('rejeita configuração adicional inválida', () => {
    assert.throws(() => loadAccounts({ PROSPECCAO_USERS_JSON: '{' }));
    assert.throws(() => loadAccounts({ PROSPECCAO_USERS_JSON: '{"dione":"senha-em-claro"}' }));
});

test('sessão assinada expira, não aceita alteração e respeita usuários ativos', () => {
    const accounts = [['dione', hash('senha-dione')]];
    const token = createSession('dione', 'segredo', 1000);
    assert.equal(readSession(token, 'segredo', accounts, 1001), 'dione');
    assert.equal(readSession(token, 'outro-segredo', accounts, 1001), null);
    assert.equal(readSession(token, 'segredo', [], 1001), null);
    assert.equal(readSession(token, 'segredo', accounts, 1000 + 7 * 24 * 60 * 60 * 1000), null);
});

test('reset revoga sessões antigas só do usuário afetado', () => {
    const accounts = [['lucas', hash('nova-senha')], ['dione', hash('senha-dione')]];
    const oldLucas = createSession('lucas', 'segredo', 1000);
    const oldDione = createSession('dione', 'segredo', 1000);
    const newLucas = createSession('lucas', 'segredo', 3000);
    const revoked = { lucas: 2000 };
    assert.equal(readSession(oldLucas, 'segredo', accounts, 3001, revoked), null);
    assert.equal(readSession(oldDione, 'segredo', accounts, 3001, revoked), 'dione');
    assert.equal(readSession(newLucas, 'segredo', accounts, 3001, revoked), 'lucas');
});
