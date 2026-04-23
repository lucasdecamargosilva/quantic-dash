-- Responsavel pela oportunidade (quem ta tocando o lead)
ALTER TABLE leads
ADD COLUMN responsavel TEXT;

CREATE INDEX idx_leads_responsavel ON leads(responsavel);
