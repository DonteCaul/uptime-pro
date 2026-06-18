-- App-wide key/value settings (admin-only read/write).
create table if not exists public.app_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

-- Only admins can read/write settings.
alter table public.app_settings enable row level security;

create policy "admin_select" on public.app_settings
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "admin_insert" on public.app_settings
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "admin_update" on public.app_settings
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Seed the Dekunu compat setting from the current env var default.
insert into public.app_settings (key, value)
values ('dekunu_compat', 'false')
on conflict (key) do nothing;
