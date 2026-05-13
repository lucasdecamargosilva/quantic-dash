-- FUNÇÃO E TRIGGER PARA SINCRONIZAR LEADS DE PROSPECÇÃO (Instagram/Email/WhatsApp)
-- COM A TABELA opportunities DO CRM
--
-- Diferente do sync_leads_to_crm.sql (que só age em leads_qualificados "Qualificado pela IA"),
-- este propaga mudanças de status do funil de prospecção (dm_enviada, mensagem_1/2/3, email_enviado)
-- direto pra opportunities.stage, sempre setando responsible_name = 'Prospecção Empresa'.

-- Mapeamento status → stage
CREATE OR REPLACE FUNCTION map_prospect_status_to_stage(p_status text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE p_status
    WHEN 'novo'              THEN 'Novo'
    WHEN 'dm_enviada'        THEN 'DM Enviada'
    WHEN 'mensagem_1'        THEN 'Mensagem 1'
    WHEN 'mensagem_2'        THEN 'Mensagem 2'
    WHEN 'mensagem_3'        THEN 'Mensagem 3'
    WHEN 'email_enviado'     THEN 'Email Enviado'
    WHEN 'respondeu'         THEN 'Respondeu'
    WHEN 'lead_coletado'     THEN 'Lead Coletado'
    WHEN 'fotos_enviadas'    THEN 'Fotos Enviadas'
    WHEN 'interessado'       THEN 'Interessado'
    WHEN 'stand_by'          THEN 'Stand By'
    WHEN 'reuniao_agendada'  THEN 'Reunião Agendada'
    WHEN 'testando'          THEN 'Testando'
    WHEN 'fechou'            THEN 'Fechou'
    WHEN 'perdida'           THEN 'Perdida'
    WHEN 'descartado'        THEN 'Descartado'
    ELSE NULL
  END;
END;
$$;

-- Função que sincroniza um lead da tabela `leads` pra opportunities
CREATE OR REPLACE FUNCTION sync_prospect_lead_to_crm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_id uuid;
  v_stage text;
  v_company text;
  v_pipeline text := 'Quantic Starter';
  v_responsible text := 'Prospecção Empresa';
BEGIN
  -- Não age em status que não temos mapeamento (defensivo)
  v_stage := map_prospect_status_to_stage(NEW.status);
  IF v_stage IS NULL THEN
    RETURN NEW;
  END IF;

  -- Se status é 'novo' e estamos em INSERT, não cria opportunity ainda
  -- (deixa pro primeiro disparo de DM/email criar a oportunidade)
  IF TG_OP = 'INSERT' AND NEW.status = 'novo' THEN
    RETURN NEW;
  END IF;

  -- Define o nome da empresa pro contato (prioriza nome_loja, fallback pra instagram)
  v_company := COALESCE(NULLIF(NEW.nome_loja, ''), NEW.instagram);

  -- Encontra contato existente por email ou nome da empresa (case-insensitive)
  SELECT id INTO v_contact_id
  FROM contacts
  WHERE (LOWER(email) = LOWER(NEW.email) AND NEW.email IS NOT NULL AND NEW.email != '')
     OR (LOWER(company_name) = LOWER(v_company) AND v_company IS NOT NULL)
  ORDER BY created_at DESC
  LIMIT 1;

  -- Cria contato novo se não existir
  IF v_contact_id IS NULL THEN
    INSERT INTO contacts (
      full_name,
      company_name,
      phone,
      email,
      acquisition_channels,
      created_at
    )
    VALUES (
      COALESCE(NULLIF(NEW.nome_loja, ''), NEW.instagram, 'Lead Prospecção'),
      v_company,
      NULLIF(NEW.telefone, ''),
      NULLIF(NEW.email, ''),
      'Prospecção Instagram',
      NOW()
    )
    RETURNING id INTO v_contact_id;
  END IF;

  -- Cria opportunity se não existir, ou atualiza o stage se existir
  IF NOT EXISTS (SELECT 1 FROM opportunities WHERE contact_id = v_contact_id) THEN
    INSERT INTO opportunities (
      contact_id,
      stage,
      pipeline,
      responsible_name,
      tags,
      created_at,
      updated_at
    )
    VALUES (
      v_contact_id,
      v_stage,
      v_pipeline,
      v_responsible,
      ARRAY['Prospecção'],
      NOW(),
      NOW()
    );
  ELSE
    UPDATE opportunities
    SET stage = v_stage,
        responsible_name = v_responsible,
        updated_at = NOW()
    WHERE contact_id = v_contact_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger AFTER INSERT OR UPDATE OF status na tabela leads
DROP TRIGGER IF EXISTS on_prospect_lead_status_change ON leads;
CREATE TRIGGER on_prospect_lead_status_change
AFTER INSERT OR UPDATE OF status ON leads
FOR EACH ROW
EXECUTE FUNCTION sync_prospect_lead_to_crm();

-- Backfill: sincroniza todos os leads que já têm um status mapeado e ainda não estão em opportunities
DO $$
DECLARE
  r RECORD;
  v_contact_id uuid;
  v_stage text;
  v_company text;
BEGIN
  FOR r IN
    SELECT * FROM leads
    WHERE status NOT IN ('novo')
    ORDER BY updated_at DESC
  LOOP
    v_stage := map_prospect_status_to_stage(r.status);
    IF v_stage IS NULL THEN CONTINUE; END IF;

    v_company := COALESCE(NULLIF(r.nome_loja, ''), r.instagram);

    SELECT id INTO v_contact_id
    FROM contacts
    WHERE (LOWER(email) = LOWER(r.email) AND r.email IS NOT NULL AND r.email != '')
       OR (LOWER(company_name) = LOWER(v_company) AND v_company IS NOT NULL)
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_contact_id IS NULL THEN
      INSERT INTO contacts (
        full_name, company_name, phone, email, acquisition_channels, created_at
      )
      VALUES (
        COALESCE(NULLIF(r.nome_loja, ''), r.instagram, 'Lead Prospecção'),
        v_company,
        NULLIF(r.telefone, ''),
        NULLIF(r.email, ''),
        'Prospecção Instagram',
        NOW()
      )
      RETURNING id INTO v_contact_id;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM opportunities WHERE contact_id = v_contact_id) THEN
      INSERT INTO opportunities (
        contact_id, stage, pipeline, responsible_name, tags, created_at, updated_at
      )
      VALUES (
        v_contact_id, v_stage, 'Quantic Starter', 'Prospecção Empresa',
        ARRAY['Prospecção'], NOW(), NOW()
      );
    ELSE
      UPDATE opportunities
      SET stage = v_stage,
          responsible_name = 'Prospecção Empresa',
          updated_at = NOW()
      WHERE contact_id = v_contact_id;
    END IF;
  END LOOP;
END;
$$;
