-- =============================================================
-- Módulo PJ (Quantic Dashboard) — tabelas core
-- Executar UMA VEZ no Supabase SQL Editor
-- =============================================================

-- 1. Clientes PJ (empresas contratantes) -----------------------
CREATE TABLE IF NOT EXISTS pj_clientes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id),
    nome TEXT NOT NULL,
    documento TEXT,
    email TEXT,
    telefone TEXT,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pj_clientes_ativo ON pj_clientes(ativo);
CREATE INDEX IF NOT EXISTS idx_pj_clientes_nome ON pj_clientes(nome);

-- 2. Receitas PJ (contas a receber / recebidas) ----------------
CREATE TABLE IF NOT EXISTS pj_receitas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id),
    cliente_id uuid REFERENCES pj_clientes(id) ON DELETE SET NULL,
    descricao TEXT,
    valor NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
    valor_recebido NUMERIC(12,2),
    data_emissao DATE,
    data_vencimento DATE NOT NULL,
    data_recebimento DATE,
    -- status: 'open' = a receber (inclui vencidos — overdue é computado no front),
    --        'received' = recebido, 'cancelled' = cancelado
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','received','cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pj_receitas_status ON pj_receitas(status);
CREATE INDEX IF NOT EXISTS idx_pj_receitas_venc ON pj_receitas(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_pj_receitas_cliente ON pj_receitas(cliente_id);

-- 3. Custos lançados manualmente (passado pago + futuro a pagar)
CREATE TABLE IF NOT EXISTS pj_custos_lancados (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id),
    descricao TEXT NOT NULL,
    categoria TEXT,
    valor NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
    data_pagamento DATE NOT NULL,
    pago BOOLEAN DEFAULT false,
    observacao TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pj_custos_data ON pj_custos_lancados(data_pagamento);

-- 4. Configuração por usuário (saldo inicial, etc.) -------------
CREATE TABLE IF NOT EXISTS pj_config (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id),
    chave TEXT NOT NULL,
    valor TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, chave)
);

-- =============================================================
-- RLS (Row-Level Security) — leitura/escrita para autenticados
-- =============================================================
ALTER TABLE pj_clientes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pj_receitas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pj_custos_lancados ENABLE ROW LEVEL SECURITY;
ALTER TABLE pj_config          ENABLE ROW LEVEL SECURITY;

-- pj_clientes
DROP POLICY IF EXISTS "pj_clientes_all_auth" ON pj_clientes;
CREATE POLICY "pj_clientes_all_auth" ON pj_clientes
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- pj_receitas
DROP POLICY IF EXISTS "pj_receitas_all_auth" ON pj_receitas;
CREATE POLICY "pj_receitas_all_auth" ON pj_receitas
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- pj_custos_lancados
DROP POLICY IF EXISTS "pj_custos_lancados_all_auth" ON pj_custos_lancados;
CREATE POLICY "pj_custos_lancados_all_auth" ON pj_custos_lancados
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- pj_config — cada usuário só lê/grava suas próprias configs
DROP POLICY IF EXISTS "pj_config_own_rows" ON pj_config;
CREATE POLICY "pj_config_own_rows" ON pj_config
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
