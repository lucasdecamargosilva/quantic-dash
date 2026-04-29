-- Adiciona novo status no pipeline: email_enviado
-- Posição: entre mensagem_3 e respondeu (alternativa de canal após esgotar Instagram)
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
            'email_enviado',
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
