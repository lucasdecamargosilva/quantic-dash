-- CRM upstream: categoria + status "perdida"
-- Consolida migrations 007 (categoria) e 008 (perdida) do crmquantic
-- Executar UMA VEZ no Supabase SQL Editor após as migrations anteriores do CRM

-- 1. Categoria (nicho da loja) -------------------------------
ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'oculos'
        CHECK (categoria IN ('oculos', 'roupa'));

CREATE INDEX IF NOT EXISTS idx_leads_categoria ON leads(categoria);

-- 2. Novo status "perdida" (engajou mas não fechou) ----------
-- Postgres não aceita alterar CHECK constraint — precisa recriar
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;

ALTER TABLE leads
    ADD CONSTRAINT leads_status_check
        CHECK (status IN ('lead_coletado', 'novo', 'dm_enviada', 'respondeu', 'interessado', 'fechou', 'perdida', 'descartado'));
