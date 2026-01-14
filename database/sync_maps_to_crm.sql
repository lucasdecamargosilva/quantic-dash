-- FUNÇÃO E TRIGGER PARA SINCRONIZAR LEADS DO GOOGLE MAPS COM O CRM

-- 1. Cria a função que será executada quando um lead for inserido em leads_google_maps
CREATE OR REPLACE FUNCTION sync_maps_lead_to_crm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_contact_id bigint;
  default_pipeline text := 'Quantic Starter'; -- Pipeline padrão
  default_stage text := 'Contato';           -- Etapa padrão
BEGIN
  -- Tenta encontrar um contato existente (pelo email ou telefone ou nome da empresa)
  SELECT id INTO new_contact_id FROM contacts 
  WHERE (email = NEW.email AND NEW.email IS NOT NULL AND NEW.email != '') 
     OR (phone = NEW.telefone AND NEW.telefone IS NOT NULL AND NEW.telefone != '')
     OR (company_name = NEW.empresa AND NEW.empresa IS NOT NULL);

  -- Se não existir contato, cria um novo
  IF new_contact_id IS NULL THEN
    INSERT INTO contacts (full_name, company_name, phone, email, business_type, created_at)
    VALUES (
      COALESCE(NEW.empresa, 'Lead Google Maps'), -- Nome
      NEW.empresa,                                 -- Empresa
      NEW.telefone,
      NEW.email,
      NEW.categoria_negocio,                       -- Tipo de negócio
      NOW()
    )
    RETURNING id INTO new_contact_id;
  END IF;

  -- Verifica se já existe uma oportunidade para este contato no CRM
  -- Se não existir, cria uma no pipeline Quantic Starter, etapa Contato
  IF NOT EXISTS (SELECT 1 FROM opportunities WHERE contact_id = new_contact_id) THEN
    INSERT INTO opportunities (contact_id, stage, pipeline, responsible_name, tags, created_at)
    VALUES (
      new_contact_id,
      default_stage,
      default_pipeline,
      'Sistema', -- Responsável inicial
      ARRAY['Lead Google Maps', 'Automático'],
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Cria o Trigger na tabela leads_google_maps
DROP TRIGGER IF EXISTS on_maps_lead_insert ON leads_google_maps;
CREATE TRIGGER on_maps_lead_insert
AFTER INSERT ON leads_google_maps
FOR EACH ROW
EXECUTE FUNCTION sync_maps_lead_to_crm();

-- 3. Backfill (Opcional - roda uma vez para sincronizar os já existentes)
DO $$
DECLARE
  r RECORD;
  new_contact_id bigint;
BEGIN
  FOR r IN SELECT * FROM leads_google_maps LOOP
    
    -- Procura contato existente
    SELECT id INTO new_contact_id FROM contacts 
    WHERE (email = r.email AND r.email IS NOT NULL AND r.email != '') 
       OR (phone = r.telefone AND r.telefone IS NOT NULL AND r.telefone != '')
       OR (company_name = r.empresa AND r.empresa IS NOT NULL);

    -- Se não existir, cria novo
    IF new_contact_id IS NULL THEN
      INSERT INTO contacts (full_name, company_name, phone, email, business_type, created_at)
      VALUES (
        COALESCE(r.empresa, 'Lead Google Maps'),
        r.empresa,
        r.telefone,
        r.email,
        r.categoria_negocio,
        NOW()
      )
      RETURNING id INTO new_contact_id;
    END IF;

    -- Se não existir opportunity, cria uma
    IF NOT EXISTS (SELECT 1 FROM opportunities WHERE contact_id = new_contact_id) THEN
      INSERT INTO opportunities (contact_id, stage, pipeline, responsible_name, tags, created_at)
      VALUES (
        new_contact_id,
        'Contato',
        'Quantic Starter',
        'Sistema',
        ARRAY['Lead Google Maps', 'Backfill'],
        NOW()
      );
    END IF;
    
  END LOOP;
END;
$$;
