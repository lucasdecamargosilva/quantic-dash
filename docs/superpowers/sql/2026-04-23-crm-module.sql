-- =============================================================
-- Módulo CRM (Prospector) — tabelas consolidadas
-- Agrega as 6 migrations originais do projeto crmquantic em um script único
-- Executar UMA VEZ no Supabase SQL Editor
-- =============================================================

-- 1. LEADS (prospects / oportunidades) -------------------------
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instagram TEXT UNIQUE NOT NULL,
    nome_loja TEXT,
    site TEXT,
    seguidores INTEGER DEFAULT 0,
    tem_provador BOOLEAN DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'novo'
        CHECK (status IN ('lead_coletado','novo','dm_enviada','respondeu','interessado','fechou','descartado')),
    idioma TEXT NOT NULL DEFAULT 'pt'
        CHECK (idioma IN ('pt','en','es')),
    ponto_positivo BOOLEAN NOT NULL DEFAULT FALSE,
    responsavel TEXT,
    notas TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. INTERACOES (histórico de contatos com cada lead) ----------
CREATE TABLE IF NOT EXISTS interacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL
        CHECK (tipo IN ('dm_enviada','resposta','follow_up','nota')),
    conteudo TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Trigger de updated_at em leads ----------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leads_updated_at ON leads;
CREATE TRIGGER leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- 4. Índices ---------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_leads_status      ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_instagram   ON leads(instagram);
CREATE INDEX IF NOT EXISTS idx_leads_responsavel ON leads(responsavel);
CREATE INDEX IF NOT EXISTS idx_interacoes_lead_id    ON interacoes(lead_id);
CREATE INDEX IF NOT EXISTS idx_interacoes_created_at ON interacoes(created_at);

-- 5. RLS (Row-Level Security) ---------------------------------
ALTER TABLE leads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE interacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_all_auth" ON leads;
CREATE POLICY "leads_all_auth" ON leads
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "interacoes_all_auth" ON interacoes;
CREATE POLICY "interacoes_all_auth" ON interacoes
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
