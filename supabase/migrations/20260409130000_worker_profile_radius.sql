alter table public.worker_profiles
  add column if not exists service_radius_km int not null default 15;

alter table public.worker_profiles
  drop constraint if exists worker_profiles_service_radius_km_check;

alter table public.worker_profiles
  add constraint worker_profiles_service_radius_km_check
  check (service_radius_km between 1 and 300);
