-- Admin tomonidan boshqariladigan import manbalari (Telegram kanallar, saytlar)
create table if not exists public.import_sources (
  id         uuid    primary key default gen_random_uuid(),
  type       text    not null check (type in ('telegram_channel', 'website', 'custom')),
  identifier text    not null,   -- @channel_username, -100123456, https://...
  label      text,
  enabled    boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_import_sources_identifier
  on public.import_sources (lower(identifier));

create index if not exists idx_import_sources_type_enabled
  on public.import_sources (type, enabled);
