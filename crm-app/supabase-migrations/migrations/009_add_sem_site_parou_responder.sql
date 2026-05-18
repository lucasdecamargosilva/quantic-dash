-- Adiciona status "sem_site" e "parou_responder" no pipeline
-- Ambos ficam ANTES de "perdida" pra separar motivos de queda.
-- Inclui também os statuses já existentes no banco (mensagem_1, etc)
-- que vinham sendo gravados pelos scrapers sem estar no CHECK.

ALTER TABLE leads
DROP CONSTRAINT IF EXISTS leads_status_check;

ALTER TABLE leads
ADD CONSTRAINT leads_status_check
    CHECK (status IN (
        'novo',
        'dm_enviada',
        'mensagem_1',
        'mensagem_2',
        'mensagem_3',
        'email_enviado',
        'fotos_enviadas',
        'respondeu',
        'lead_coletado',
        'interessado',
        'reuniao_agendada',
        'testando',
        'stand_by',
        'fechou',
        'sem_site',
        'parou_responder',
        'perdida',
        'descartado'
    ));
