-- SQL para limpar e padronizar as tags de leads do Google Maps
-- Remove 'Automático' e garante 'QUENTE 🔥'

-- 1. Identifica e limpa todas as tags de leads do Maps
UPDATE opportunities
SET tags = ARRAY['GOOGLE MAPS', 'QUENTE 🔥']
WHERE tags @> ARRAY['GOOGLE MAPS']::text[]
   OR tags @> ARRAY['Lead Google Maps']::text[]
   OR tags @> ARRAY['LEAD GOOGLE MAPS']::text[];

-- 2. Garantir que o status também esteja como Quente para esses leads
UPDATE opportunities
SET lead_status = 'Quente'
WHERE tags @> ARRAY['GOOGLE MAPS']::text[];
