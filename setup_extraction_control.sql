-- Helper table to control extraction flow and UI state
create table public.extraction_control (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  status text not null, -- 'started', 'completed', 'failed'
  details text
);

-- Enable RLS
alter table public.extraction_control enable row level security;

-- Allow read access for realtime
create policy "Allow read access for all users"
on public.extraction_control
for select
to anon, authenticated
using (true);

-- Allow insert access (so n8n can post here easily via REST API with Anon Key if desired, 
-- or you can use Service Role key in n8n for stricter security, but Anon + RLS is fine for this demo)
create policy "Allow insert access for all users"
on public.extraction_control
for insert
to anon, authenticated
with check (true);
