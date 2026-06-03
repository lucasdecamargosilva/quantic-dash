-- Adiciona a coluna `plataforma` na tabela leads para distinguir instagram/tiktok.
--
-- ADITIVO E SEGURO: nao mexe em constraints, indices ou colunas existentes.
-- Linhas existentes (Instagram) ganham plataforma='instagram' automaticamente.
-- O fluxo do Instagram continua funcionando exatamente igual (ignora a coluna nova).
--
-- Mantemos o UNIQUE(instagram) original. Consequencia: se um @handle do TikTok
-- for igual a um @handle ja existente no Instagram, esse lead do TikTok e pulado
-- como duplicado (sem erro). Raro, e o custo de manter risco zero na estrutura atual.
--
-- Rodar uma vez no Supabase (SQL editor). Idempotente.

ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS plataforma TEXT NOT NULL DEFAULT 'instagram';

CREATE INDEX IF NOT EXISTS idx_leads_plataforma ON leads (plataforma);
