-- Adiciona 3 novos status no pipeline: mensagem_1, mensagem_2, mensagem_3
-- Posição: entre dm_enviada e respondeu (cadência de follow-up)
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;

ALTER TABLE leads
    ADD CONSTRAINT leads_status_check
        CHECK (status IN (
            'lead_coletado',
            'novo',
            'dm_enviada',
            'mensagem_1',
            'mensagem_2',
            'mensagem_3',
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
