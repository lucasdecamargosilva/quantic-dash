-- Metas comerciais mensais compartilhadas pelo CRM React (/crm/metas).
CREATE TABLE IF NOT EXISTS public.crm_metas (
    periodo            TEXT PRIMARY KEY CHECK (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    meta_clientes      INTEGER NOT NULL DEFAULT 0 CHECK (meta_clientes >= 0),
    meta_mrr           NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (meta_mrr >= 0),
    meta_recebimentos  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (meta_recebimentos >= 0),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.crm_metas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gestao le metas" ON public.crm_metas;
DROP POLICY IF EXISTS "gestao insere metas" ON public.crm_metas;
DROP POLICY IF EXISTS "gestao atualiza metas" ON public.crm_metas;

CREATE POLICY "gestao le metas"
  ON public.crm_metas FOR SELECT TO authenticated USING (true);

CREATE POLICY "gestao insere metas"
  ON public.crm_metas FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "gestao atualiza metas"
  ON public.crm_metas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
