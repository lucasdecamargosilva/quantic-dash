-- Etapa específica para lojistas que receberam o Provou Catálogo em teste grátis.
-- O valor-base continua compatível com leads.status; a etapa detalhada fica no overlay.

ALTER TABLE public.crm_lead_etapas
    DROP CONSTRAINT IF EXISTS crm_lead_etapas_status_check;

ALTER TABLE public.crm_lead_etapas
    ADD CONSTRAINT crm_lead_etapas_status_check
    CHECK (status IN ('testou_e_saiu', 'teste_catalogo_7_dias'));
