-- Tabela de histórico de pagamentos Provou Levou
CREATE TABLE IF NOT EXISTS pl_pagamentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id uuid NOT NULL REFERENCES provou_levou_stores(id) ON DELETE CASCADE,
    data_pagamento DATE NOT NULL,
    valor NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
    plano TEXT,
    observacao TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_pl_pagamentos_cliente ON pl_pagamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pl_pagamentos_data ON pl_pagamentos(data_pagamento DESC);

ALTER TABLE pl_pagamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pl_pagamentos_read_auth" ON pl_pagamentos
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "pl_pagamentos_insert_auth" ON pl_pagamentos
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "pl_pagamentos_update_auth" ON pl_pagamentos
    FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "pl_pagamentos_delete_auth" ON pl_pagamentos
    FOR DELETE USING (auth.role() = 'authenticated');

-- Trigger: mantém provou_levou_stores.last_payment sincronizado com o MAX(data_pagamento)
-- (last_payment em provou_levou_stores é VARCHAR, então cast explícito para TEXT)
CREATE OR REPLACE FUNCTION update_pl_last_payment()
RETURNS TRIGGER AS $$
DECLARE
    target_id uuid;
BEGIN
    target_id := COALESCE(NEW.cliente_id, OLD.cliente_id);
    UPDATE provou_levou_stores
    SET last_payment = (
        SELECT MAX(data_pagamento)::text
        FROM pl_pagamentos
        WHERE cliente_id = target_id
    )
    WHERE id = target_id;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pl_pagamentos_last_payment ON pl_pagamentos;
CREATE TRIGGER trg_pl_pagamentos_last_payment
AFTER INSERT OR UPDATE OR DELETE ON pl_pagamentos
FOR EACH ROW
EXECUTE FUNCTION update_pl_last_payment();

-- Seed inicial: importa o last_payment atual de cada cliente como 1ª entrada no histórico
-- (idempotente: só insere se cliente ainda não tem nenhum pagamento registrado)
-- provou_levou_stores.last_payment é VARCHAR → cast com proteção contra vazios/inválidos
INSERT INTO pl_pagamentos (cliente_id, data_pagamento, valor, plano, observacao)
SELECT
    s.id,
    NULLIF(s.last_payment, '')::date,
    CASE s.plan
        WHEN 'Starter'     THEN 97
        WHEN 'Inicial'     THEN 197
        WHEN 'Médio'       THEN 397
        WHEN 'Premium'     THEN 797
        WHEN 'Ultra Power' THEN 2200
        ELSE 0
    END,
    s.plan,
    'Seed inicial (migração de last_payment)'
FROM provou_levou_stores s
WHERE s.last_payment IS NOT NULL
  AND s.last_payment <> ''
  AND s.last_payment ~ '^\d{4}-\d{2}-\d{2}'
  AND NOT EXISTS (SELECT 1 FROM pl_pagamentos p WHERE p.cliente_id = s.id);
