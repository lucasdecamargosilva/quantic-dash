-- Adiciona status "lead_coletado" para leads recem-capturados que ainda nao foram aprovados
ALTER TABLE leads
DROP CONSTRAINT IF EXISTS leads_status_check;

ALTER TABLE leads
ADD CONSTRAINT leads_status_check
    CHECK (status IN ('lead_coletado', 'novo', 'dm_enviada', 'respondeu', 'interessado', 'fechou', 'descartado'));
