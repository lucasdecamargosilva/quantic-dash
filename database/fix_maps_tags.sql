-- SQL para padronizar as tags do Google Maps
-- 1. Remove variações antigas e adiciona 'GOOGLE MAPS'
UPDATE opportunities
SET tags = array_append(array_remove(array_remove(tags, 'Lead Google Maps'), 'LEAD GOOGLE MAPS'), 'GOOGLE MAPS')
WHERE tags @> ARRAY['Lead Google Maps']::text[] 
   OR tags @> ARRAY['LEAD GOOGLE MAPS']::text[];

-- 2. Garante que não existam duplicatas
UPDATE opportunities
SET tags = (SELECT array_agg(DISTINCT x) FROM unnest(tags) t(x))
WHERE tags @> ARRAY['GOOGLE MAPS']::text[];
