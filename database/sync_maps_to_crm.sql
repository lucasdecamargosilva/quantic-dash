-- FUNÇÃO E TRIGGER PARA SINCRONIZAR LEADS DO GOOGLE MAPS COM O CRM

-- 1. Cria a função que será executada quando um lead for inserido em leads_google_maps
CREATE OR REPLACE FUNCTION sync_maps_lead_to_crm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_contact_id uuid;
  default_pipeline text := 'Quantic Starter';
  default_stage text := 'Contato';
BEGIN
  -- Tenta encontrar um contato existente por telefone ou empresa
  SELECT id INTO new_contact_id FROM contacts 
  WHERE (phone = NEW.telefone::text AND NEW.telefone IS NOT NULL AND NEW.telefone != '') 
     OR (company_name = NEW.empresa AND NEW.empresa IS NOT NULL AND NEW.empresa != '');

  -- Se não existir contato, cria um novo
  IF new_contact_id IS NULL THEN
    INSERT INTO contacts (
      full_name, 
      company_name, 
      phone, 
      email, 
      business_type, 
      acquisition_channels,
      created_at
    )
    VALUES (
      COALESCE(NEW.empresa, 'Lead Google Maps'),
      NEW.empresa,
      NEW.telefone::text,
      NULL,
      NEW.categoria_negocio,
      'Google Maps',
      NOW()
    )
    RETURNING id INTO new_contact_id;
  END IF;

  -- Verifica se já existe uma oportunidade para este contato (apenas se tivermos um ID válido)
  IF new_contact_id IS NOT NULL AND new_contact_id != '00000000-0000-0000-0000-000000000000'::uuid THEN
    IF NOT EXISTS (SELECT 1 FROM opportunities WHERE contact_id = new_contact_id) THEN
      INSERT INTO opportunities (
        contact_id, 
        stage, 
        pipeline, 
        responsible_name, 
        tags,
        lead_status,
        created_at,
        updated_at
      )
      VALUES (
        new_contact_id,
        default_stage,
        default_pipeline,
        'Sistema',
        ARRAY['Lead Google Maps', 'Automático', 'quente']::text[],
        'Quente',
        NOW(),
        NOW()
      );
    END IF;
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

-- 3. Backfill (Sincroniza os já existentes)
DO $$
DECLARE
  r RECORD;
  new_contact_id uuid;
BEGIN
  FOR r IN SELECT * FROM leads_google_maps LOOP
    
    new_contact_id := NULL;

    -- Procura contato existente
    SELECT id INTO new_contact_id FROM contacts 
    WHERE (phone = r.telefone::text AND r.telefone IS NOT NULL AND r.telefone != '') 
       OR (company_name = r.empresa AND r.empresa IS NOT NULL AND r.empresa != '');

    -- Se não existir, cria novo
    IF new_contact_id IS NULL THEN
      INSERT INTO contacts (
        full_name, 
        company_name, 
        phone, 
        email, 
        business_type, 
        acquisition_channels,
        created_at
      )
      VALUES (
        COALESCE(r.empresa, 'Lead Google Maps'),
        r.empresa,
        r.telefone::text,
        NULL,
        r.categoria_negocio,
        'Google Maps',
        NOW()
      )
      RETURNING id INTO new_contact_id;
    END IF;

    -- Se não existir opportunity, cria uma (apenas se tivermos um ID válido)
    IF new_contact_id IS NOT NULL AND new_contact_id != '00000000-0000-0000-0000-000000000000'::uuid THEN
      IF NOT EXISTS (SELECT 1 FROM opportunities WHERE contact_id = new_contact_id) THEN
        INSERT INTO opportunities (
          contact_id, 
          stage, 
          pipeline, 
          responsible_name, 
          tags,
          lead_status,
          created_at,
          updated_at
        )
        VALUES (
          new_contact_id,
          'Contato',
          'Quantic Starter',
          'Sistema',
          ARRAY['Lead Google Maps', 'Backfill', 'quente']::text[],
          'Quente',
          NOW(),
          NOW()
        );
      END IF;
    END IF;
    
  END LOOP;
END;
$$;
