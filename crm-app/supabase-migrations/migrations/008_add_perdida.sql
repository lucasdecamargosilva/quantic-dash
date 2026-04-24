-- Adiciona status "perdida" no pipeline (oportunidade engajou mas nao fechou)
ALTER TABLE leads
DROP CONSTRAINT IF EXISTS leads_status_check;

ALTER TABLE leads
ADD CONSTRAINT leads_status_check
    CHECK (status IN ('novo', 'dm_enviada', 'respondeu', 'lead_coletado', 'interessado', 'fechou', 'perdida', 'descartado'));
