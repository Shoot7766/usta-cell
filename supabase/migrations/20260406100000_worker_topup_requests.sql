-- Usta hamyon to‘ldirish: mijoz karta orqali pul o‘tkazadi, admin tasdiqlaydi
create table if not exists public.worker_topup_requests (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.users (id) on delete cascade,
  amount_cents int not null check (amount_cents > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.users (id) on delete set null
);

create index if not exists idx_worker_topup_worker on public.worker_topup_requests (worker_id, created_at desc);
create index if not exists idx_worker_topup_pending on public.worker_topup_requests (status) where status = 'pending';

alter table public.worker_topup_requests enable row level security;
create policy "deny_all_anon_topup" on public.worker_topup_requests for all using (false);
