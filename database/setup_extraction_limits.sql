-- ============================================
-- SISTEMA DE LIMITES DE LEADS POR PLANO
-- Limita quantidade de LEADS capturados (não cliques)
-- ============================================

-- Tabela para armazenar o plano de cada usuário
CREATE TABLE IF NOT EXISTS public.user_plans (
  user_id uuid references auth.users(id) on delete cascade primary key,
  plan_name text not null default 'starter', -- 'starter', 'growth', 'enterprise'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabela para rastrear LEADS capturados por dia (não extrações)
CREATE TABLE IF NOT EXISTS public.daily_lead_counts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  count_date date not null default current_date,
  channel text not null, -- 'instagram' ou 'google_maps'
  leads_count integer not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  -- Garante uma linha única por usuário, data e canal
  UNIQUE(user_id, count_date, channel)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_daily_lead_counts_user_date 
  ON public.daily_lead_counts(user_id, count_date);

CREATE INDEX IF NOT EXISTS idx_daily_lead_counts_date 
  ON public.daily_lead_counts(count_date);

-- Enable RLS
ALTER TABLE public.user_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_lead_counts ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para user_plans
DROP POLICY IF EXISTS "Users can view their own plan" ON public.user_plans;
CREATE POLICY "Users can view their own plan"
  ON public.user_plans
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own plan" ON public.user_plans;
CREATE POLICY "Users can update their own plan"
  ON public.user_plans
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Políticas RLS para daily_lead_counts
DROP POLICY IF EXISTS "Users can view their own counts" ON public.daily_lead_counts;
CREATE POLICY "Users can view their own counts"
  ON public.daily_lead_counts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own counts" ON public.daily_lead_counts;
CREATE POLICY "Users can insert their own counts"
  ON public.daily_lead_counts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own counts" ON public.daily_lead_counts;
CREATE POLICY "Users can update their own counts"
  ON public.daily_lead_counts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Função para incrementar contador de leads
CREATE OR REPLACE FUNCTION increment_lead_count(
  p_user_id uuid,
  p_channel text,
  p_count integer DEFAULT 1
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_count integer;
BEGIN
  -- Insere ou atualiza o contador
  INSERT INTO public.daily_lead_counts (user_id, count_date, channel, leads_count)
  VALUES (p_user_id, current_date, p_channel, p_count)
  ON CONFLICT (user_id, count_date, channel)
  DO UPDATE SET 
    leads_count = daily_lead_counts.leads_count + p_count,
    updated_at = now()
  RETURNING leads_count INTO v_current_count;
  
  RETURN v_current_count;
END;
$$;

-- Função para obter limite do plano
CREATE OR REPLACE FUNCTION get_plan_limit(p_plan_name text, p_channel text)
RETURNS integer
LANGUAGE plpgsql
AS $$
BEGIN
  CASE p_plan_name
    WHEN 'starter' THEN RETURN 100;
    WHEN 'growth' THEN RETURN 300;
    WHEN 'enterprise' THEN RETURN 500;
    ELSE RETURN 100; -- Default para starter
  END CASE;
END;
$$;

-- Função para verificar se usuário pode capturar mais leads
CREATE OR REPLACE FUNCTION can_capture_leads(
  p_user_id uuid,
  p_channel text,
  p_requested_count integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan_name text;
  v_current_count integer;
  v_limit integer;
  v_can_capture boolean;
  v_remaining integer;
BEGIN
  -- Busca o plano do usuário (default: starter)
  SELECT COALESCE(plan_name, 'starter')
  INTO v_plan_name
  FROM public.user_plans
  WHERE user_id = p_user_id;
  
  -- Se não encontrou, assume starter
  IF v_plan_name IS NULL THEN
    v_plan_name := 'starter';
  END IF;
  
  -- Obtém o limite do plano
  v_limit := get_plan_limit(v_plan_name, p_channel);
  
  -- Busca contagem atual do dia
  SELECT COALESCE(leads_count, 0)
  INTO v_current_count
  FROM public.daily_lead_counts
  WHERE user_id = p_user_id
    AND count_date = current_date
    AND channel = p_channel;
  
  -- Se não encontrou, assume 0
  IF v_current_count IS NULL THEN
    v_current_count := 0;
  END IF;
  
  -- Verifica se pode capturar
  v_can_capture := (v_current_count + p_requested_count) <= v_limit;
  v_remaining := GREATEST(0, v_limit - v_current_count);
  
  RETURN jsonb_build_object(
    'can_capture', v_can_capture,
    'current_count', v_current_count,
    'limit', v_limit,
    'remaining', v_remaining,
    'plan', v_plan_name,
    'requested', p_requested_count
  );
END;
$$;

-- ============================================
-- 1. ADICIONAR COLUNA USER_ID NAS TABELAS DE LEADS (Caso não existam)
-- ============================================

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads_qualificados' AND column_name='user_id') THEN
        ALTER TABLE public.leads_qualificados ADD COLUMN user_id uuid REFERENCES auth.users(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads_frios' AND column_name='user_id') THEN
        ALTER TABLE public.leads_frios ADD COLUMN user_id uuid REFERENCES auth.users(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads_google_maps' AND column_name='user_id') THEN
        ALTER TABLE public.leads_google_maps ADD COLUMN user_id uuid REFERENCES auth.users(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads_capturados_posts' AND column_name='user_id') THEN
        ALTER TABLE public.leads_capturados_posts ADD COLUMN user_id uuid REFERENCES auth.users(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunities' AND column_name='user_id') THEN
        ALTER TABLE public.opportunities ADD COLUMN user_id uuid REFERENCES auth.users(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='capturas_jobs' AND column_name='user_id') THEN
        ALTER TABLE public.capturas_jobs ADD COLUMN user_id uuid REFERENCES auth.users(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contacts' AND column_name='user_id') THEN
        ALTER TABLE public.contacts ADD COLUMN user_id uuid REFERENCES auth.users(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='custos_modelo' AND column_name='user_id') THEN
        ALTER TABLE public.custos_modelo ADD COLUMN user_id uuid REFERENCES auth.users(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clientes' AND column_name='user_id') THEN
        ALTER TABLE public.clientes ADD COLUMN user_id uuid REFERENCES auth.users(id);
    END IF;

    -- Adicionando JOB_ID nas tabelas de leads para permitir o vínculo com o dono da captura
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads_qualificados' AND column_name='job_id') THEN
        ALTER TABLE public.leads_qualificados ADD COLUMN job_id text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads_frios' AND column_name='job_id') THEN
        ALTER TABLE public.leads_frios ADD COLUMN job_id text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads_google_maps' AND column_name='job_id') THEN
        ALTER TABLE public.leads_google_maps ADD COLUMN job_id text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads_capturados_posts' AND column_name='job_id') THEN
        ALTER TABLE public.leads_capturados_posts ADD COLUMN job_id text;
    END IF;

    -- Garantindo user_id em todas as tabelas de leads para filtragem futura
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads_qualificados' AND column_name='user_id') THEN
        ALTER TABLE public.leads_qualificados ADD COLUMN user_id uuid REFERENCES auth.users(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads_frios' AND column_name='user_id') THEN
        ALTER TABLE public.leads_frios ADD COLUMN user_id uuid REFERENCES auth.users(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads_google_maps' AND column_name='user_id') THEN
        ALTER TABLE public.leads_google_maps ADD COLUMN user_id uuid REFERENCES auth.users(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads_capturados_posts' AND column_name='user_id') THEN
        ALTER TABLE public.leads_capturados_posts ADD COLUMN user_id uuid REFERENCES auth.users(id);
    END IF;
END $$;

-- ============================================
-- 2. TRIGGERS ATUALIZADOS (OPÇÃO 2: Jobs como Ponte)
-- Busca o dono do lead consultando quem iniciou o job_id
-- ============================================

-- Função trigger para Instagram (leads_qualificados)
CREATE OR REPLACE FUNCTION auto_count_instagram_qualified()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Busca o user_id na tabela capturas_jobs usando o job_id do lead
  -- Nota: Certifique-se que o registro do lead tenha a coluna job_id
  SELECT user_id INTO v_user_id 
  FROM public.capturas_jobs 
  WHERE job_id = NEW.job_id 
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    PERFORM increment_lead_count(v_user_id, 'instagram', 1);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função trigger para Instagram (leads_frios)
CREATE OR REPLACE FUNCTION auto_count_instagram_cold()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT user_id INTO v_user_id 
  FROM public.capturas_jobs 
  WHERE job_id = NEW.job_id 
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    PERFORM increment_lead_count(v_user_id, 'instagram', 1);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função trigger para Google Maps
CREATE OR REPLACE FUNCTION auto_count_google_maps()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Busca o user_id na tabela capturas_jobs usando o job_id do lead
  SELECT user_id INTO v_user_id 
  FROM public.capturas_jobs 
  WHERE job_id = NEW.job_id 
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    PERFORM increment_lead_count(v_user_id, 'google_maps', 1);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove triggers antigos se existirem
DROP TRIGGER IF EXISTS count_instagram_qualified_leads ON public.leads_qualificados;
DROP TRIGGER IF EXISTS count_instagram_cold_leads ON public.leads_frios;
DROP TRIGGER IF EXISTS count_google_maps_leads ON public.leads_google_maps;

-- Cria triggers para contar automaticamente
CREATE TRIGGER count_instagram_qualified_leads
AFTER INSERT ON public.leads_qualificados
FOR EACH ROW
EXECUTE FUNCTION auto_count_instagram_qualified();

CREATE TRIGGER count_instagram_cold_leads
AFTER INSERT ON public.leads_frios
FOR EACH ROW
EXECUTE FUNCTION auto_count_instagram_cold();

CREATE TRIGGER count_google_maps_leads
AFTER INSERT ON public.leads_google_maps
FOR EACH ROW
EXECUTE FUNCTION auto_count_google_maps();

-- Limpar contagens antigas (executar via cron job)
CREATE OR REPLACE FUNCTION cleanup_old_lead_counts()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.daily_lead_counts
  WHERE count_date < current_date - interval '30 days';
END;
$$;

-- Inserir plano padrão para usuários existentes
INSERT INTO public.user_plans (user_id, plan_name)
SELECT id, 'starter'
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.user_plans)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================
-- COMENTÁRIOS E DOCUMENTAÇÃO
-- ============================================

COMMENT ON TABLE public.user_plans IS 'Armazena o plano de cada usuário (starter, growth, enterprise)';
COMMENT ON TABLE public.daily_lead_counts IS 'Rastreia quantidade de LEADS capturados por dia, por canal';
COMMENT ON FUNCTION increment_lead_count IS 'Incrementa contador de leads capturados (chamado por triggers)';
COMMENT ON FUNCTION get_plan_limit IS 'Retorna limite de leads para um plano específico';
COMMENT ON FUNCTION can_capture_leads IS 'Verifica se usuário pode capturar mais X leads hoje';
COMMENT ON FUNCTION auto_count_instagram_qualified IS 'Trigger: conta leads qualificados do Instagram';
COMMENT ON FUNCTION auto_count_instagram_cold IS 'Trigger: conta leads frios do Instagram';
COMMENT ON FUNCTION auto_count_google_maps IS 'Trigger: conta leads do Google Maps';

-- ============================================
-- QUERIES ÚTEIS PARA MONITORAMENTO
-- ============================================

-- Ver uso de hoje de um usuário
-- SELECT * FROM daily_lead_counts WHERE user_id = auth.uid() AND count_date = current_date;

-- Verificar se pode capturar 50 leads
-- SELECT can_capture_leads(auth.uid(), 'instagram', 50);

-- Ver plano do usuário
-- SELECT plan_name FROM user_plans WHERE user_id = auth.uid();

-- Resetar contador (admin)
-- DELETE FROM daily_lead_counts WHERE user_id = 'uuid-aqui' AND count_date = current_date;
