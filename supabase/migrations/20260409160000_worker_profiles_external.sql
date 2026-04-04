-- Tashqi kanallardan import qilingan usta profillari uchun qo'shimcha ustunlar
alter table public.worker_profiles
  add column if not exists source               text not null default 'app',
  add column if not exists source_url           text,
  add column if not exists external_phone       text,
  add column if not exists external_handle      text,
  add column if not exists external_dedupe_key  text,
  add column if not exists import_meta          jsonb not null default '{}';

create unique index if not exists idx_worker_profiles_ext_dedupe
  on public.worker_profiles (external_dedupe_key)
  where external_dedupe_key is not null;

-- Telefon raqami orqali foydalanuvchi qidirish uchun indeks
create index if not exists idx_users_phone
  on public.users (phone)
  where phone is not null;
