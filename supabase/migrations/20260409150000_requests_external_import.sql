-- Tashqi kanallar (Telegram, OLX va h.k.) orqali import qilingan so'rovlar uchun metadata
alter table public.requests
  add column if not exists imported_from_external boolean not null default false,
  add column if not exists source_provider        text,
  add column if not exists source_label           text,
  add column if not exists source_url             text,
  add column if not exists external_contact_name  text,
  add column if not exists external_contact_phone text,
  add column if not exists external_contact_handle text,
  add column if not exists external_chat_id       text,
  add column if not exists external_message_id    text,
  add column if not exists external_dedupe_key    text,
  add column if not exists import_meta            jsonb not null default '{}';

create unique index if not exists idx_requests_external_dedupe
  on public.requests (external_dedupe_key)
  where external_dedupe_key is not null;

create index if not exists idx_requests_imported
  on public.requests (source_provider, created_at desc)
  where imported_from_external = true;
