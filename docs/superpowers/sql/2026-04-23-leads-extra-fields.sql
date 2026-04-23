-- Campos extras na oportunidade (lead)
-- responsavel já existe (ver 2026-04-23-crm-module.sql)
ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS fonte_oportunidade TEXT,
    ADD COLUMN IF NOT EXISTS telefone TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_fonte ON leads(fonte_oportunidade);
