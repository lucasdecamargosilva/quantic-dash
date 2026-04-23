-- Marcacao de ponto positivo com o lead (oportunidade quente)
ALTER TABLE leads
ADD COLUMN ponto_positivo BOOLEAN NOT NULL DEFAULT FALSE;
