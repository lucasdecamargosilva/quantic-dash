require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurações do Chatwoot
let CHATWOOT_URL = process.env.CHATWOOT_URL || 'https://chatwoot.segredosdodrop.com';
if (CHATWOOT_URL.endsWith('/')) CHATWOOT_URL = CHATWOOT_URL.slice(0, -1);

const PLATFORM_TOKEN = process.env.PLATFORM_TOKEN;
const CHATWOOT_USER_ID = process.env.CHATWOOT_USER_ID || 1;

// Configurações do Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jytsrxrmgvliyyuktxsd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

// 1. Endpoints do Dashboard (Devem vir PRIMEIRO)
app.get('/api/config', (req, res) => {
    res.json({ supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY });
});

app.get('/api/chatwoot/sso', async (req, res) => {
    try {
        if (!PLATFORM_TOKEN) throw new Error('PLATFORM_TOKEN missing');
        const response = await axios.get(
            `${CHATWOOT_URL}/platform/api/v1/users/${CHATWOOT_USER_ID}/login`,
            { headers: { api_access_token: PLATFORM_TOKEN }, timeout: 10000 }
        );
        if (response.data && response.data.url) {
            // Retorna apenas o caminho relativo para o iframe usar o proxy do root
            const ssoPath = response.data.url.replace(CHATWOOT_URL, '');
            return res.json({ success: true, ssoUrl: ssoPath });
        }
        throw new Error('Invalid response from Chatwoot');
    } catch (error) {
        console.error('❌ Erro SSO:', error.message);
        res.status(500).json({ success: false, error: 'Falha ao acessar Chatwoot', details: error.message });
    }
});

// 2. Servir arquivos estáticos do Dashboard
// Se o arquivo existir na pasta local, ele será entregue.
app.use(express.static(__dirname));

// 3. PROXY CATCH-ALL (O "Coringa")
// Qualquer rota que não seja um arquivo local ou uma rota definida acima será enviada ao Chatwoot.
// Isso resolve AUTOMATICAMENTE todos os erros 404 de ativos (/vite, /assets, /brand-assets, etc).
app.use('/', createProxyMiddleware({
    target: CHATWOOT_URL,
    changeOrigin: true,
    secure: false,
    ws: true, // Suporte a WebSockets para tempo real
    onProxyRes: (proxyRes) => {
        // Remove as travas de segurança de TODAS as respostas do Chatwoot
        delete proxyRes.headers['x-frame-options'];
        delete proxyRes.headers['content-security-policy'];
        proxyRes.headers['X-Frame-Options'] = 'ALLOWALL';
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    },
    cookieDomainRewrite: "" // Reescreve os cookies para o domínio do seu dashboard
}));

app.listen(PORT, () => {
    console.log(`🚀 Quantic Dashboard em modo Híbrido ativo na porta ${PORT}`);
});
