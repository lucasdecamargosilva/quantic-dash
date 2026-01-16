-- SQL para remover a tag 'Backfill' de todas as oportunidades
UPDATE opportunities
SET tags = array_remove(tags, 'Backfill')
WHERE tags @> ARRAY['Backfill']::text[];

-- Caso a tag esteja em caixa alta 'BACKFILL'
UPDATE opportunities
SET tags = array_remove(tags, 'BACKFILL')
WHERE tags @> ARRAY['BACKFILL']::text[];
