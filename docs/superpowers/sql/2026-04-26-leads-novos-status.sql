-- Adiciona 3 novos status no pipeline: stand_by, fotos_enviadas, reuniao_agendada
-- Postgres não aceita ALTER em CHECK constraint — precisa drop + recreate
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;

ALTER TABLE leads
    ADD CONSTRAINT leads_status_check
        CHECK (status IN (
            'lead_coletado',
            'novo',
            'dm_enviada',
            'respondeu',
            'fotos_enviadas',
            'stand_by',
            'reuniao_agendada',
            'interessado',
            'fechou',
            'perdida',
            'descartado'
        ));
