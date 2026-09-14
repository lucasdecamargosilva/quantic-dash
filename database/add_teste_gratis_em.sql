BEGIN;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS teste_gratis_em date;
CREATE OR REPLACE FUNCTION public.registra_inicio_teste_gratis()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.teste_gratis_em IS NULL AND NEW.status::text IN ('testando', 'teste_catalogo_7_dias')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    NEW.teste_gratis_em := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS leads_inicio_teste_gratis ON public.leads;
CREATE TRIGGER leads_inicio_teste_gratis BEFORE INSERT OR UPDATE OF status ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.registra_inicio_teste_gratis();
NOTIFY pgrst, 'reload schema';
COMMIT;
