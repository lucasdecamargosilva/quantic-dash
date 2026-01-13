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

// 1. Endpoints do Dashboard (Devem vir ANTES do Proxy para não serem sequestrados)
app.get('/api/config', (req, res) => {
    res.json({
        supabaseUrl: SUPABASE_URL,
        supabaseAnonKey: SUPABASE_ANON_KEY
    });
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
        res.status(500).json({ success: false, error: 'Falha ao gerar acesso', details: error.message });
    }
});

// 2. Middleware para servir arquivos estáticos do Dashboard
app.use(express.static(__dirname));

// 3. Proxy para Ativos do Chatwoot (Vite, Assets, etc)
const assetProxy = createProxyMiddleware({
    target: CHATWOOT_URL,
    changeOrigin: true,
    secure: false
});

app.use('/vite', assetProxy);
app.use('/assets', assetProxy);
app.use('/packs', assetProxy);
app.use('/rails', assetProxy);
app.use('/app', assetProxy);
// Mapeamos o /api do Chatwoot apenas se não for pego pelos nossos routes acima
app.use('/api', assetProxy);

// 4. Proxy Principal (Túnel) com Injeção de Tag Base
app.use('/chatwoot-proxy', createProxyMiddleware({
    target: CHATWOOT_URL,
    changeOrigin: true,
    pathRewrite: { '^/chatwoot-proxy': '' },
    selfHandleResponse: true,
    onProxyReq: (proxyReq) => {
        proxyReq.setHeader('accept-encoding', 'identity');
    },
    onProxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
        res.removeHeader('X-Frame-Options');
        res.removeHeader('Content-Security-Policy');
        res.setHeader('X-Frame-Options', 'ALLOWALL');

        if (proxyRes.headers['content-type'] && proxyRes.headers['content-type'].includes('text/html')) {
            let html = responseBuffer.toString('utf8');
            const baseTag = `<head><base href="${CHATWOOT_URL}/">`;
            html = html.includes('<head>') ? html.replace('<head>', baseTag) : html.replace('<html>', `<html>${baseTag}`);
            return Buffer.from(html);
        }
        return responseBuffer;
    }),
    cookieDomainRewrite: "",
    followRedirects: true,
    secure: false,
    ws: true
}));

app.listen(PORT, () => {
    console.log(`🚀 Quantic Dashboard ativo em http://localhost:${PORT}`);
});
