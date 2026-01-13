require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurações do Chatwoot (Vindas do .env no EasyPanel)
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

// Middleware para servir arquivos estáticos
app.use(express.static(__dirname));

// Endpoint para entregar as configs pro frontend
app.get('/api/config', (req, res) => {
    res.json({
        supabaseUrl: SUPABASE_URL,
        supabaseAnonKey: SUPABASE_ANON_KEY
    });
});

// Endpoint SSO - Direto para o link oficial
app.get('/api/chatwoot/sso', async (req, res) => {
    try {
        const response = await axios.get(
            `${CHATWOOT_URL}/platform/api/v1/users/${CHATWOOT_USER_ID}/login`,
            { headers: { api_access_token: PLATFORM_TOKEN } }
        );

        res.json({ success: true, ssoUrl: response.data.url });
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
