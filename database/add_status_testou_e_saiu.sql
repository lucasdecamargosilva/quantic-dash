-- Etapas personalizadas que nao cabem na constraint legada de leads.status.
-- O frontend sobrepoe este status ao carregar o lead e mantem stand_by como
-- valor-base compativel na tabela leads.

CREATE TABLE IF NOT EXISTS crm_lead_etapas (
    lead_id UUID PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('testou_e_saiu')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE crm_lead_etapas TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION update_crm_lead_etapas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS crm_lead_etapas_updated_at ON crm_lead_etapas;
CREATE TRIGGER crm_lead_etapas_updated_at
    BEFORE UPDATE ON crm_lead_etapas
    FOR EACH ROW EXECUTE FUNCTION update_crm_lead_etapas_updated_at();
