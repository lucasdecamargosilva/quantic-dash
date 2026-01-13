require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurações do Chatwoot
let CHATWOOT_URL = process.env.CHATWOOT_URL || 'https://chatwoot.segredosdodrop.com';
if (CHATWOOT_URL.endsWith('/')) CHATWOOT_URL = CHATWOOT_URL.slice(0, -1);

const PLATFORM_TOKEN = process.env.PLATFORM_TOKEN;
const CHATWOOT_USER_ID = process.env.CHATWOOT_USER_ID || 1;

// Configurações do Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jytsrxrmgvliyyuktxsd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!PLATFORM_TOKEN) {
    console.error('❌ Erro: PLATFORM_TOKEN não definido');
}

// Proxy para os ativos internos do Chatwoot (conserta os erros 404)
const assetProxy = createProxyMiddleware({
    target: CHATWOOT_URL,
    changeOrigin: true,
    secure: false
});

app.use('/vite', assetProxy);
app.use('/assets', assetProxy);
app.use('/packs', assetProxy);
app.use('/rails', assetProxy);
app.use('/api', assetProxy);
app.use('/app', assetProxy);

// Proxy para a página principal do Chatwoot
app.use('/chatwoot-proxy', createProxyMiddleware({
    target: CHATWOOT_URL,
    changeOrigin: true,
    pathRewrite: { '^/chatwoot-proxy': '' },
    onProxyRes: function (proxyRes, req, res) {
        // Remove as travas de segurança do Chatwoot
        delete proxyRes.headers['x-frame-options'];
        delete proxyRes.headers['content-security-policy'];
        res.setHeader('X-Frame-Options', 'ALLOWALL');
    },
    cookieDomainRewrite: "",
    followRedirects: true,
    secure: false,
    ws: true // Suporte a WebSockets se necessário
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
        if (!PLATFORM_TOKEN) throw new Error('PLATFORM_TOKEN missing');

        const response = await axios.get(
            `${CHATWOOT_URL}/platform/api/v1/users/${CHATWOOT_USER_ID}/login`,
            {
                headers: { api_access_token: PLATFORM_TOKEN },
                timeout: 5000
            }
        );

        if (response.data && response.data.url) {
            const ssoUrl = response.data.url.replace(CHATWOOT_URL, '/chatwoot-proxy');
            return res.json({ success: true, ssoUrl });
        }

        throw new Error('Invalid response from Chatwoot');
    } catch (error) {
        console.error('❌ Erro SSO:', error.message);
        res.status(500).json({
            success: false,
            error: 'Falha ao gerar acesso',
            details: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Quantic Dashboard ativo`);
    console.log(`🌍 Domínio: https://quanticsolutions.com.br`);
    console.log(`Local via: http://localhost:${PORT}`);
});
