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

// 1. PRIORIDADE: Rotas do Próprio Dashboard
app.get('/api/config', (req, res) => {
    res.json({ supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY });
});

app.get('/api/chatwoot/sso', async (req, res) => {
    try {
        if (!PLATFORM_TOKEN) throw new Error('PLATFORM_TOKEN missing');
        const response = await axios.get(
            `${CHATWOOT_URL}/platform/api/v1/users/${CHATWOOT_USER_ID}/login`,
            { headers: { api_access_token: PLATFORM_TOKEN }, timeout: 5000 }
        );
        if (response.data && response.data.url) {
            const ssoUrl = response.data.url.replace(CHATWOOT_URL, '/chatwoot-proxy');
            return res.json({ success: true, ssoUrl });
        }
        throw new Error('Invalid response from Chatwoot');
    } catch (error) {
        console.error('❌ Erro SSO:', error.message);
        res.status(500).json({ success: false, error: 'Falha ao acessar Chatwoot', details: error.message });
    }
});

// 2. Arquivos estáticos do Dashboard
app.use(express.static(__dirname));

// 3. PROXY PARA ATIVOS (Conserta erros 404)
const assetProxy = createProxyMiddleware({
    target: CHATWOOT_URL,
    changeOrigin: true,
    secure: false,
    onProxyRes: (proxyRes) => {
        delete proxyRes.headers['x-frame-options'];
        delete proxyRes.headers['content-security-policy'];
    }
});

app.use('/vite', assetProxy);
app.use('/assets', assetProxy);
app.use('/packs', assetProxy);
app.use('/rails', assetProxy);
app.use('/app', assetProxy);
// Mapeamos o /api do Chatwoot apenas se não for pego pelas nossas rotas acima
app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/config') || req.path.startsWith('/chatwoot/sso')) return next();
    assetProxy(req, res, next);
});

// 4. PROXY PRINCIPAL (Túnel para o Iframe)
app.use('/chatwoot-proxy', createProxyMiddleware({
    target: CHATWOOT_URL,
    changeOrigin: true,
    pathRewrite: { '^/chatwoot-proxy': '' },
    onProxyRes: (proxyRes) => {
        // Remove as travas de segurança
        delete proxyRes.headers['x-frame-options'];
        delete proxyRes.headers['content-security-policy'];
        // Permite exibição em iframe
        proxyRes.headers['X-Frame-Options'] = 'ALLOWALL';
    },
    cookieDomainRewrite: "", // Mantém os cookies no domínio local
    followRedirects: true,
    ws: true,
    secure: false
}));

app.listen(PORT, () => {
    console.log(`🚀 Servidor Quantic Online na porta ${PORT}`);
});
