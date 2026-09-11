-- Estrutura de pedidos e configuração da dashboard da Soven Eyewear.
-- A credencial OAuth permanece em provou_levou_stores e não é versionada.

CREATE TABLE IF NOT EXISTS public.soven_orders
  (LIKE public.velaro_orders INCLUDING ALL);

GRANT ALL ON TABLE public.soven_orders TO anon, authenticated, service_role;

UPDATE public.provou_levou_stores
SET name = 'Soven Eyewear',
    domain = 'https://soveneyewear.com/',
    email = 'soveneyewear@gmail.com',
    platform = 'shopify',
    categoria = 'oculos',
    active = true,
    api_key_active = true,
    status = 'Teste Gratuito',
    plan = COALESCE(plan, 'Starter'),
    api_address = 'k31trh-bs.myshopify.com/admin/api/2024-10',
    updated_at = now()
WHERE store_id = 'k31trh-bs.myshopify.com';

UPDATE public.lojistas
SET tabela = 'geracoes_provou_levou',
    tabela_pedidos = 'soven_orders',
    origem = 'soveneyewear.com',
    campo_telefone_pedido = 'customer_email',
    campo_total_pedido = 'total',
    campo_status_pedido = 'payment_status',
    campo_nome_pedido = 'customer_name',
    valores_status_pago = ARRAY['paid'],
    campo_data_pedido = 'paid_at',
    campo_produto_pedido = 'product_name',
    nome_loja = 'Soven Eyewear',
    categoria = 'oculos'
WHERE email = 'soveneyewear@gmail.com';

INSERT INTO public.lojistas (
  email,
  tabela,
  tabela_pedidos,
  origem,
  campo_telefone_pedido,
  campo_total_pedido,
  campo_status_pedido,
  campo_nome_pedido,
  valores_status_pago,
  campo_data_pedido,
  campo_produto_pedido,
  nome_loja,
  categoria
)
SELECT
  'soveneyewear@gmail.com',
  'geracoes_provou_levou',
  'soven_orders',
  'soveneyewear.com',
  'customer_email',
  'total',
  'payment_status',
  'customer_name',
  ARRAY['paid'],
  'paid_at',
  'product_name',
  'Soven Eyewear',
  'oculos'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.lojistas
  WHERE email = 'soveneyewear@gmail.com'
);
