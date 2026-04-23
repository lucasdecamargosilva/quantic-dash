-- Adiciona campo idioma para saber qual mensagem enviar
ALTER TABLE leads
ADD COLUMN idioma TEXT NOT NULL DEFAULT 'pt'
    CHECK (idioma IN ('pt', 'en'));

-- Atualiza todos existentes como 'pt' (ja sao brasileiros)
UPDATE leads SET idioma = 'pt' WHERE idioma IS NULL;
