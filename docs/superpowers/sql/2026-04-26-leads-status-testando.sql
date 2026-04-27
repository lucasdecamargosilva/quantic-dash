-- Adiciona status "testando" no pipeline (entre reuniao_agendada e fechou)
-- Lead em fase de teste do produto (free trial / piloto) antes do fechamento
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;

ALTER TABLE leads
    ADD CONSTRAINT leads_status_check
        CHECK (status IN (
            'lead_coletado',
            'novo',
            'dm_enviada',
            'respondeu',
            'fotos_enviadas',
            'interessado',
            'stand_by',
            'reuniao_agendada',
            'testando',
            'fechou',
            'perdida',
            'descartado'
        ));
