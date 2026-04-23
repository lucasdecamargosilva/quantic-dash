-- Adiciona coluna categoria à tabela pj_receitas
-- Permite classificar entradas por tipo (Tecnologia, Marketing, Devolução Saque, etc.)
ALTER TABLE pj_receitas
    ADD COLUMN IF NOT EXISTS categoria TEXT;

CREATE INDEX IF NOT EXISTS idx_pj_receitas_categoria ON pj_receitas(categoria);
