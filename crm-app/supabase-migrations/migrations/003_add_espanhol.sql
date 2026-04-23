-- Adiciona espanhol como idioma valido
ALTER TABLE leads
DROP CONSTRAINT leads_idioma_check;

ALTER TABLE leads
ADD CONSTRAINT leads_idioma_check
    CHECK (idioma IN ('pt', 'en', 'es'));
