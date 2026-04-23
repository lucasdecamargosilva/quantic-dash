-- Tabela de leads
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instagram TEXT UNIQUE NOT NULL,
    nome_loja TEXT,
    site TEXT,
    seguidores INTEGER DEFAULT 0,
    tem_provador BOOLEAN DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'novo'
        CHECK (status IN ('novo', 'dm_enviada', 'respondeu', 'interessado', 'fechou', 'descartado')),
    notas TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de interacoes
CREATE TABLE interacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL
        CHECK (tipo IN ('dm_enviada', 'resposta', 'follow_up', 'nota')),
    conteudo TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Indices
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_instagram ON leads(instagram);
CREATE INDEX idx_interacoes_lead_id ON interacoes(lead_id);
CREATE INDEX idx_interacoes_created_at ON interacoes(created_at);
