const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { loadAccounts, isAuthorized } = require('../prospeccao-auth');

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
