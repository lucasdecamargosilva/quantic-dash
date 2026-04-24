-- Categoria do lead (nicho da loja)
ALTER TABLE leads
ADD COLUMN categoria TEXT NOT NULL DEFAULT 'oculos'
    CHECK (categoria IN ('oculos', 'roupa'));

CREATE INDEX idx_leads_categoria ON leads(categoria);
