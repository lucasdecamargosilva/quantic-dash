const express = require('express');
const axios = require('axios');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurações do Chatwoot
const CHATWOOT_URL = process.env.CHATWOOT_URL || 'https://chatwoot.segredosdodrop.com';
const PLATFORM_TOKEN = process.env.PLATFORM_TOKEN;
const CHATWOOT_USER_ID = process.env.CHATWOOT_USER_ID || 1;

// Configurações do Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jytsrxrmgvliyyuktxsd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!PLATFORM_TOKEN) {
    console.error('❌ Erro: PLATFORM_TOKEN não definido');
    process.exit(1);
}

// Proxy para os ativos internos do Chatwoot (conserta os erros 404 da imagem)
const assetProxy = createProxyMiddleware({
    target: CHATWOOT_URL,
    changeOrigin: true,
    secure: false
});

app.use('/vite', assetProxy);
app.use('/assets', assetProxy);
app.use('/packs', assetProxy);
app.use('/rails', assetProxy);

// Proxy Inteligente para a página de login/app
app.use('/chatwoot-proxy', createProxyMiddleware({
    target: CHATWOOT_URL,
    changeOrigin: true,
    pathRewrite: { '^/chatwoot-proxy': '' },
    onProxyRes: function (proxyRes, req, res) {
        delete proxyRes.headers['x-frame-options'];
        delete proxyRes.headers['content-security-policy'];
        res.setHeader('X-Frame-Options', 'ALLOWALL');

        if (proxyRes.headers['content-type'] && proxyRes.headers['content-type'].includes('text/html')) {
            const originalWrite = res.write;
            const originalEnd = res.end;
            let body = '';
            res.write = function (chunk) { body += chunk; };
            res.end = function (chunk) {
                if (chunk) body += chunk;
                const baseTag = `<head><base href="${CHATWOOT_URL}/">`;
                const injectedBody = body.replace('<head>', baseTag);
                res.setHeader('Content-Length', Buffer.byteLength(injectedBody));
                originalWrite.call(res, injectedBody);
                originalEnd.call(res);
            };
        }
    },
    cookieDomainRewrite: "",
    followRedirects: true,
    secure: false
}));

// Middleware para servir arquivos estáticos
app.use(express.static(__dirname));

// Endpoint para entregar as configs pro frontend
app.get('/api/config', (req, res) => {
    res.json({
        supabaseUrl: SUPABASE_URL,
        supabaseAnonKey: SUPABASE_ANON_KEY
    });
});

// Endpoint SSO - Agora retorna a URL que passa pelo Proxy
app.get('/api/chatwoot/sso', async (req, res) => {
    try {
        const response = await axios.get(
            `${CHATWOOT_URL}/platform/api/v1/users/${CHATWOOT_USER_ID}/login`,
            { headers: { api_access_token: PLATFORM_TOKEN } }
        );

        // Transformamos a URL original em uma que aponta para o nosso proxy local
        const ssoUrl = response.data.url.replace(CHATWOOT_URL, '/chatwoot-proxy');
        res.json({ success: true, ssoUrl });
    } catch (error) {
        console.error('❌ Erro SSO:', error.message);
        res.status(500).json({ success: false, error: 'Falha ao gerar acesso' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Quantic Dashboard ativo`);
    console.log(`🌍 Domínio: https://quanticsolutions.com.br`);
    console.log(`Local via: http://localhost:${PORT}`);
});
