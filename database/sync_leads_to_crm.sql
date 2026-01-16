-- FUNÇÃO E TRIGGER PARA SINCRONIZAR LEADS QUALIFICADOS COM O CRM

-- 1. Cria a função que será executada quando um lead for inserido ou atualizado
CREATE OR REPLACE FUNCTION sync_qualified_lead_to_crm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_contact_id bigint;
  default_pipeline text := 'Quantic Starter'; -- Pipeline padrão
  default_stage text := 'Contato';           -- Etapa padrão
BEGIN
  -- Apenas executa se o status contiver 'Qualificado' ou 'Quente'
  IF New.status ILIKE '%Qualificado%' OR New.status ILIKE '%quente%' THEN
    
    -- Tenta encontrar um contato existente (pelo email ou usuário/instagram)
    SELECT id INTO new_contact_id FROM contacts 
    WHERE (email = NEW.email AND NEW.email IS NOT NULL AND NEW.email != '') 
       OR (company_name = NEW.usuario AND NEW.usuario IS NOT NULL);

    -- Se não existir contato, cria um novo
    IF new_contact_id IS NULL THEN
      INSERT INTO contacts (full_name, company_name, phone, email, created_at)
      VALUES (
        COALESCE(NEW.nome_cliente, NEW.usuario, 'Lead IA'), -- Nome
        NEW.usuario, -- Empresa (usamos o @ do instagram como empresa provisoriamente)
        NEW.telefone,
        NEW.email,
        NOW()
      )
      RETURNING id INTO new_contact_id;
    END IF;

    -- Verifica se já existe uma oportunidade para este contato no CRM
    -- Se não existir, cria o Card no CRM
    IF NOT EXISTS (SELECT 1 FROM opportunities WHERE contact_id = new_contact_id) THEN
      INSERT INTO opportunities (contact_id, stage, pipeline, responsible_name, tags, created_at)
      VALUES (
        new_contact_id,
        default_stage,
        default_pipeline,
        'IA', -- Responsável inicial
        ARRAY['Lead IA'],
        NOW()
      );
    END IF;

  END IF;
  RETURN NEW;
END;
$$;

-- 2. Cria o Trigger na tabela leads_qualificados
DROP TRIGGER IF EXISTS on_lead_qualified ON leads_qualificados;
CREATE TRIGGER on_lead_qualified
AFTER INSERT OR UPDATE OF status ON leads_qualificados
FOR EACH ROW
EXECUTE FUNCTION sync_qualified_lead_to_crm();

-- 3. Backfill (Opcional - roda uma vez para sincronizar os já existentes)
DO $$
DECLARE
  r RECORD;
  new_contact_id bigint;
BEGIN
  FOR r IN SELECT * FROM leads_qualificados WHERE status ILIKE '%Qualificado%' OR status ILIKE '%quente%' LOOP
    
    SELECT id INTO new_contact_id FROM contacts 
    WHERE (email = r.email AND r.email IS NOT NULL AND r.email != '') 
       OR (company_name = r.usuario AND r.usuario IS NOT NULL);

    IF new_contact_id IS NULL THEN
      INSERT INTO contacts (full_name, company_name, phone, email, created_at)
      VALUES (
        COALESCE(r.nome_cliente, r.usuario, 'Lead IA'),
        r.usuario,
        r.telefone,
        r.email,
        NOW()
      )
      RETURNING id INTO new_contact_id;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM opportunities WHERE contact_id = new_contact_id) THEN
      INSERT INTO opportunities (contact_id, stage, pipeline, responsible_name, tags, created_at)
      VALUES (
        new_contact_id,
        'Contato',
        'Quantic Starter',
        'IA',
        ARRAY['Lead IA'],
        NOW()
      );
    END IF;
    
  END LOOP;
END;
$$;
