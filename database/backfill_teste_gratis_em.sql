-- Recupera somente inícios explicitamente registrados no histórico.
-- Não usa created_at do lead, pois a coleta pode anteceder o teste.
BEGIN;
WITH historico AS (
  SELECT lead_id, (min(created_at) AT TIME ZONE 'America/Sao_Paulo')::date AS inicio
  FROM public.interacoes
  WHERE conteudo ILIKE 'Catálogo %' AND (
    conteudo ILIKE '%criado e lead movido para o teste gr%'
    OR conteudo ILIKE '%criado para o teste gr%'
    OR conteudo ILIKE '%criado e ativado no teste gr%'
  )
  GROUP BY lead_id
)
UPDATE public.leads l SET teste_gratis_em = h.inicio
FROM historico h WHERE l.id=h.lead_id AND l.teste_gratis_em IS NULL;
COMMIT;
