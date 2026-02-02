const express = require('express');
const axios = require('axios');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
app.set('trust proxy', 1);

const PORT = 3000;
const CHATWOOT_URL = 'https://chatwoot.segredosdodrop.com';
const PLATFORM_TOKEN = 'AXGGMhrWkqRShtLGFSSJyepr';
const CHATWOOT_USER_ID = 1;

// 1) CORS para seu site chamar /api/chatwoot/sso com fetch + credentials
app.use((req, res, next) => {
    // Se seu site roda em outra porta/domínio, troque aqui.
    res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
    res.header('Access-Control-Expose-Headers', 'set-cookie');

    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// 2) Endpoint SSO (pega a URL de login do Chatwoot)
app.get('/api/chatwoot/sso', async (req, res) => {
    try {
        const response = await axios.get(
            `${CHATWOOT_URL}/platform/api/v1/users/${CHATWOOT_USER_ID}/login`,
            { headers: { api_access_token: PLATFORM_TOKEN } }
        );

        res.json({ success: true, ssoUrl: response.data.url });
    } catch (error) {
        console.error('❌ Erro SSO:', error.response?.data || error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3) Servir seus arquivos locais (Quantic)
// (Sem wildcard tipo /*.html — isso que estava quebrando) [web:43][web:46]
app.use(express.static(__dirname, { index: false }));

// 4) Proxy “catch-all” do Chatwoot
// Regra: tudo que NÃO for arquivo local do Quantic e NÃO for /api/* vai pro Chatwoot.
// Isso garante que /vite/assets/*, /packs/* etc funcionem. [web:48]
app.use(
    createProxyMiddleware({
        target: CHATWOOT_URL,
        changeOrigin: true,
        ws: true,

        // Decide o que vai para o Chatwoot
        filter: (pathname, req) => {
            // Nunca proxiar o endpoint interno do SSO
            if (pathname.startsWith('/api/')) return false;

            // Seus arquivos locais (ajuste se tiver outros)
            const localExact = new Set([
                '/conversas.html',
                '/index.html',
                '/crm.html',
                '/crm-cliente.html',
                '/contatos.html',
                '/captacao.html',
                '/style.css',
                '/script.js',
                '/theme-handler.js',
                '/logo.png',
            ]);
            if (localExact.has(pathname)) return false;

            // Qualquer coisa que pareça arquivo local (se seu projeto tiver mais assets)
            if (
                pathname.endsWith('.html') ||
                pathname.endsWith('.css') ||
                pathname.endsWith('.js') ||
                pathname.endsWith('.png') ||
                pathname.endsWith('.jpg') ||
                pathname.endsWith('.jpeg') ||
                pathname.endsWith('.svg') ||
                pathname.endsWith('.ico') ||
                pathname.endsWith('.woff') ||
                pathname.endsWith('.woff2') ||
                pathname.endsWith('.ttf')
            ) {
                // se você tiver esses arquivos localmente, eles serão servidos pelo express.static
                // se não tiver, pode cair no 404 local; se quiser, remova este bloco.
                return false;
            }

            // O resto vai pro Chatwoot (inclui /vite, /packs, /brand-assets etc)
            return true;
        },

        onProxyReq: (proxyReq, req, res) => {
            // Forward de cookies (pra sessões)
            if (req.headers.cookie) proxyReq.setHeader('Cookie', req.headers.cookie);

            // Ajuda algumas validações de origem
            proxyReq.setHeader('Origin', CHATWOOT_URL);
            proxyReq.setHeader('Referer', CHATWOOT_URL);
        },

        onProxyRes: (proxyRes, req, res) => {
            // Remove headers que impedem iframe
            delete proxyRes.headers['x-frame-options'];
            delete proxyRes.headers['content-security-policy'];
            delete proxyRes.headers['content-security-policy-report-only'];

            // Reescrever cookies (localhost http)
            if (proxyRes.headers['set-cookie']) {
                proxyRes.headers['set-cookie'] = proxyRes.headers['set-cookie'].map((cookie) =>
                    cookie
                        .replace(/;\s*Secure/gi, '')
                        .replace(/;\s*SameSite=\w+/gi, '')
                        .replace(/;\s*Domain=[^;]+/gi, '')
                );
            }
        },

        onError: (err, req, res) => {
            console.error('❌ Proxy error:', err.message);
            if (!res.headersSent) res.status(500).send('Proxy error');
        },
    })
);

app.listen(PORT, () => {
    console.log(`🚀 Server em http://localhost:${PORT}`);
    console.log(`📄 Abra: http://localhost:${PORT}/conversas.html`);
});
