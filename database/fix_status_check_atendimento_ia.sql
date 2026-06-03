-- =============================================================
-- Atualiza leads_status_check com a lista completa de status:
--   + 'atendimento_ia' ("Atendimento com IA") — ja existe no frontend
--     de producao mas a constraint nunca foi atualizada (falha 23514)
--   + 'whatsapp' ("Whatsapp") — nova pipeline para leads tratados via WhatsApp
--
-- IMPORTANTE: adicionar 'whatsapp' aqui SO permite gravar o status no banco.
-- A COLUNA so aparece no CRM apos o frontend (crm-app) tambem incluir
-- 'whatsapp' em LEAD_STATUSES / PIPELINE_STATUSES / STATUS_LABELS /
-- STATUS_COLORS / STATUS_HEX / mapa de transicoes, e ser re-deployado.
--
-- Executar UMA VEZ no Supabase SQL Editor.
-- =============================================================

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
