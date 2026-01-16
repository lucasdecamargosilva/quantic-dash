-- SQL para atualizar a tag 'quente' ou 'QUENTE' para 'QUENTE 🔥'
-- 1. Removemos a tag antiga e adicionamos a nova com o emoji em um único comando
UPDATE opportunities
SET tags = array_append(array_remove(tags, 'quente'), 'QUENTE 🔥')
WHERE tags @> ARRAY['quente']::text[];

UPDATE opportunities
SET tags = array_append(array_remove(tags, 'QUENTE'), 'QUENTE 🔥')
WHERE tags @> ARRAY['QUENTE']::text[];

-- 2. Garantir que não existam duplicatas se o lead já tiver a tag com emoji
UPDATE opportunities
SET tags = (SELECT array_agg(DISTINCT x) FROM unnest(tags) t(x))
WHERE tags @> ARRAY['QUENTE 🔥']::text[];
