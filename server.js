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
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://quantic-supabase.k5jwra.easypanel.host';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

// Configurações do Meta Marketing API (Facebook Ads)
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const META_API_VERSION = process.env.META_API_VERSION || 'v21.0';

// 1. Endpoints do Dashboard (Devem vir PRIMEIRO)
app.get('/api/config', (req, res) => {
    res.json({ supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY });
});

// Redireciona a raiz pra Custos (página Desempenho desativada)
app.get('/', (req, res) => res.redirect('/custos.html'));
app.get('/index.html', (req, res) => res.redirect('/custos.html'));

// ========== META ADS (Marketing API) ==========
// Proxy server-side: o token NUNCA vai pro front
function metaError(res, error) {
    console.error('❌ Meta API:', error?.response?.data || error.message);
    res.status(error?.response?.status || 500).json({
        error: error?.response?.data?.error?.message || error.message,
        code: error?.response?.data?.error?.code,
        type: error?.response?.data?.error?.type
    });
}

// Insights agregados (totais + breakdown opcional por dia)
// Query: ?since=YYYY-MM-DD&until=YYYY-MM-DD&breakdown=daily
app.get('/api/meta/insights', async (req, res) => {
    if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
        return res.status(500).json({ error: 'META_ACCESS_TOKEN ou META_AD_ACCOUNT_ID não configurados' });
    }
    try {
        const since = req.query.since;
        const until = req.query.until;
        if (!since || !until) return res.status(400).json({ error: 'since e until são obrigatórios (YYYY-MM-DD)' });
        const breakdown = req.query.breakdown === 'daily' ? '&time_increment=1' : '';
        const fields = 'spend,impressions,clicks,ctr,cpc,cpm,reach,actions,action_values,date_start,date_stop';
        const url = `https://graph.facebook.com/${META_API_VERSION}/${META_AD_ACCOUNT_ID}/insights` +
            `?fields=${fields}` +
            `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}` +
            breakdown +
            `&access_token=${META_ACCESS_TOKEN}`;
        const r = await axios.get(url, { timeout: 15000 });
        res.json(r.data);
    } catch (e) { metaError(res, e); }
});

// Por campanha
// Query: ?since=YYYY-MM-DD&until=YYYY-MM-DD
app.get('/api/meta/campaigns', async (req, res) => {
    if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
        return res.status(500).json({ error: 'META_ACCESS_TOKEN ou META_AD_ACCOUNT_ID não configurados' });
    }
    try {
        const since = req.query.since;
        const until = req.query.until;
        if (!since || !until) return res.status(400).json({ error: 'since e until são obrigatórios' });
        const fields = 'campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,cpm,reach,actions,action_values,objective';
        const url = `https://graph.facebook.com/${META_API_VERSION}/${META_AD_ACCOUNT_ID}/insights` +
            `?level=campaign&fields=${fields}` +
            `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}` +
            `&limit=200&access_token=${META_ACCESS_TOKEN}`;
        const r = await axios.get(url, { timeout: 15000 });
        res.json(r.data);
    } catch (e) { metaError(res, e); }
});

// Metadados da conta (nome, currency, timezone) — pra mostrar no header
app.get('/api/meta/account', async (req, res) => {
    if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
        return res.status(500).json({ error: 'META_ACCESS_TOKEN ou META_AD_ACCOUNT_ID não configurados' });
    }
    try {
        const url = `https://graph.facebook.com/${META_API_VERSION}/${META_AD_ACCOUNT_ID}` +
            `?fields=name,currency,timezone_name,account_status&access_token=${META_ACCESS_TOKEN}`;
        const r = await axios.get(url, { timeout: 10000 });
        res.json(r.data);
    } catch (e) { metaError(res, e); }
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

// 2a. CRM (React SPA) — servido sob /crm/*
const CRM_DIST = path.join(__dirname, 'crm-app', 'dist');
app.use('/crm', express.static(CRM_DIST));
// SPA fallback: qualquer rota do React Router dentro do /crm/ retorna o index.html
app.get(/^\/crm(\/.*)?$/, (req, res, next) => {
    const fs = require('fs');
    const indexPath = path.join(CRM_DIST, 'index.html');
    if (!fs.existsSync(indexPath)) return next();
    res.sendFile(indexPath);
});

// 2b. Servir arquivos estáticos do Dashboard (HTML/CSS/JS raiz)
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
