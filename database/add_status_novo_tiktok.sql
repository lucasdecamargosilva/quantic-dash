-- =============================================================
-- Adiciona o status 'novo_tiktok' (coluna "Novo TikTok" do pipeline).
--
-- A coluna NOVO existente passa a se chamar "Novo Instagram" (so o label muda
-- no frontend; o valor 'novo' no banco continua igual). A captura do TikTok
-- (exportar_tiktok.py) grava status='novo_tiktok' -> cai na nova coluna.
--
-- Esta lista reproduz a constraint atual (ver fix_status_check_atendimento_ia.sql)
-- + 'novo_tiktok'. Mantem 'whatsapp' que ja havia sido adicionado.
--
-- A coluna so aparece no CRM apos o frontend (crm-app) incluir 'novo_tiktok' em
-- LeadStatus / LEAD_STATUSES / PIPELINE_STATUSES / STATUS_LABELS / STATUS_COLORS /
-- STATUS_HEX e ser re-deployado (ja feito neste commit).
--
-- Executar UMA VEZ no Supabase SQL Editor.
-- =============================================================

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;

ALTER TABLE leads
    ADD CONSTRAINT leads_status_check
        CHECK (status IN (
            'lead_coletado',
            'novo',
            'novo_tiktok',
            'dm_enviada',
            'mensagem_1',
            'mensagem_2',
            'mensagem_3',
            'meta',
            'email_a_enviar',
            'email_enviado',
            'respondeu',
            'whatsapp',
            'atendimento_ia',
            'fotos_enviadas',
            'interessado',
            'stand_by',
            'reuniao_agendada',
            'testando',
            'fechou',
            'sem_site',
            'parou_responder',
            'perdida',
            'descartado'
        ));
