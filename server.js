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

// 2. Arquivos estáticos do Dashboard (JS, CSS local)
app.use(express.static(__dirname));

// 3. PROXY INTELIGENTE (Túnel para o Chatwoot)
// Esse proxy só cuida de remover as travas e avisar ao navegador onde os arquivos estão.
app.use('/chatwoot-proxy', createProxyMiddleware({
    target: CHATWOOT_URL,
    changeOrigin: true,
    pathRewrite: { '^/chatwoot-proxy': '' },
    selfHandleResponse: true, // Permite que a gente edite o HTML antes de entregar
    onProxyReq: (proxyReq) => {
        // Evita que o Chatwoot mande o arquivo compactado (GZIP), o que causaria o erro 500
        proxyReq.setHeader('accept-encoding', 'identity');
    },
    onProxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
        // Remove as travas de segurança original do Chatwoot
        res.removeHeader('X-Frame-Options');
        res.removeHeader('Content-Security-Policy');
        res.setHeader('X-Frame-Options', 'ALLOWALL');

        // Se o que o Chatwoot mandou for uma página HTML, injetamos a correção de links
        const contentType = proxyRes.headers['content-type'];
        if (contentType && contentType.includes('text/html')) {
            let html = responseBuffer.toString('utf8');

            // Injetamos a tag <base> para que os ícones e JS carreguem do lugar certo
            const baseTag = `<head><base href="${CHATWOOT_URL}/">`;

            if (html.includes('<head>')) {
                html = html.replace('<head>', baseTag);
            } else if (html.includes('<html>')) {
                html = html.replace('<html>', `<html>${baseTag}`);
            }

            return Buffer.from(html);
        }

        // Se for imagem ou outro arquivo, entrega sem mexer
        return responseBuffer;
    }),
    cookieDomainRewrite: "",
    followRedirects: true,
    ws: true,
    secure: false
}));

app.listen(PORT, () => {
    console.log(`🚀 Servidor Quantic Online: Porto ${PORT}`);
});
