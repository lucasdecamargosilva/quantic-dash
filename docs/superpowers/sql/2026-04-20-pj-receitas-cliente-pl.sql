-- Desacopla pj_receitas do pj_clientes para permitir referenciar
-- clientes do Provou Levou (provou_levou_stores) sem FK
ALTER TABLE pj_receitas
    DROP CONSTRAINT IF EXISTS pj_receitas_cliente_id_fkey;

-- cliente_id segue sendo UUID, mas agora sem enforcement relacional.
-- O front resolve o nome do cliente via lookup na tabela correta.
