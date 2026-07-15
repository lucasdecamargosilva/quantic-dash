-- Fila de Aprovação de disparos de prospecção.
-- Todo agente (coletor/leitor/isca/cadência/atendente) ENFILEIRA aqui; nada sai sem aprovação humana.
create table if not exists public.disparos_pendentes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  instagram text,
  nome_loja text,
  canal text,                         -- 'instagram' | 'whatsapp'
  destino text,                       -- @usuario (IG) ou telefone (WhatsApp)
  tipo text,                          -- 'msg-1' | 'msg-2' | 'msg-3' | 'isca' | 'resposta' | 'reativacao'
  motivo text,                        -- explicação humana (ex.: "Follow-up: Mensagem 2 (prova social)")
  texto text,                         -- a mensagem que será enviada
  fotos jsonb not null default '[]'::jsonb,  -- urls das fotos-isca (Fase 2)
  status_lead_atual text,             -- status do lead ao enfileirar
  proximo_status text,                -- status pro qual mover o lead após enviar
  status text not null default 'pendente',   -- pendente | aprovado | rejeitado | enviado | falhou
  criado_por text default 'agente',
  created_at timestamptz default now(),
  decidido_at timestamptz,            -- quando foi aprovado/rejeitado
  enviado_at timestamptz,
  erro text
);
create index if not exists disparos_pendentes_status_idx on public.disparos_pendentes(status);
create index if not exists disparos_pendentes_lead_idx on public.disparos_pendentes(lead_id);
-- evita 2 disparos pendentes/aprovados pro mesmo lead ao mesmo tempo
create unique index if not exists disparos_pendentes_lead_aberto_uidx
  on public.disparos_pendentes(lead_id)
  where status in ('pendente','aprovado');

alter table public.disparos_pendentes enable row level security;
create policy "rw disparos_pendentes" on public.disparos_pendentes for all using (true) with check (true);
