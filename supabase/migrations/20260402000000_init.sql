-- Usta Call — production schema (API uses service_role; RLS deny-all for defense in depth)
-- Enable extensions
create extension if not exists "pgcrypto";

-- Roles enum as text + check
create table public.users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null unique,
  username text,
  first_name text,
  last_name text,
  role text not null default 'client' check (role in ('client', 'worker', 'admin')),
  pending_role text check (pending_role is null or pending_role in ('client', 'worker', 'admin')),
  role_switch_confirm_token text,
  profile_completed boolean not null default false,
  display_name text,
  phone text,
  locale text not null default 'uz',
  onboarding_step text not null default 'start',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_users_role on public.users (role);
create index idx_users_profile on public.users (profile_completed) where profile_completed = false;

create table public.worker_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  bio text,
  services text[] not null default '{}',
  lat double precision,
  lng double precision,
  city_name text,
  price_min_cents int not null default 0,
  price_max_cents int not null default 0,
  working_hours jsonb not null default '{}',
  is_available boolean not null default true,
  avg_response_seconds int not null default 900,
  rating_avg numeric(3,2) not null default 4.50,
  rating_count int not null default 0,
  subscription_tier text not null default 'free' check (subscription_tier in ('free', 'pro')),
  leads_balance_cents int not null default 200000,
  earnings_balance_cents int not null default 0,
  no_show_strikes int not null default 0,
  cancel_strikes int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_worker_profiles_available on public.worker_profiles (is_available) where is_available = true;
create index idx_worker_profiles_services on public.worker_profiles using gin (services);
create index idx_worker_profiles_geo on public.worker_profiles (lat, lng) where lat is not null and lng is not null;
create index idx_worker_profiles_tier on public.worker_profiles (subscription_tier);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'matched', 'cancelled')),
  conversation jsonb not null default '[]',
  structured jsonb not null default '{}',
  summary text,
  category text,
  urgency text check (urgency is null or urgency in ('low', 'medium', 'high')),
  price_min_cents int,
  price_max_cents int,
  tags text[] not null default '{}',
  client_lat double precision,
  client_lng double precision,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_requests_client on public.requests (client_id, created_at desc);
create index idx_requests_status on public.requests (status);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete restrict,
  client_id uuid not null references public.users (id) on delete cascade,
  worker_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'new' check (status in ('new', 'accepted', 'in_progress', 'completed', 'canceled')),
  price_cents int not null default 0,
  eta_minutes int,
  commission_cents int not null default 0,
  lead_unlock_cents int not null default 0,
  accepted_at timestamptz,
  arrived_deadline_at timestamptz,
  work_started_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz,
  cancel_reason text,
  canceled_by text check (canceled_by is null or canceled_by in ('client', 'worker', 'system')),
  client_penalty_cents int not null default 0,
  worker_rating_delta numeric(4,2) not null default 0,
  no_show_flag boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_orders_client on public.orders (client_id, created_at desc);
create index idx_orders_worker on public.orders (worker_id, created_at desc);
create index idx_orders_status on public.orders (status);
create index idx_orders_request on public.orders (request_id);

create table public.order_events (
  id bigserial primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  event_type text not null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_order_events_order on public.order_events (order_id, created_at);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  reviewer_id uuid not null references public.users (id) on delete cascade,
  worker_id uuid not null references public.users (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (order_id)
);

create index idx_reviews_worker on public.reviews (worker_id, created_at desc);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  type text not null check (type in (
    'commission', 'subscription', 'lead_unlock', 'payout', 'penalty_client', 'penalty_worker', 'refund', 'adjustment'
  )),
  amount_cents int not null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_transactions_user on public.transactions (user_id, created_at desc);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  tier text not null check (tier in ('free', 'pro')),
  active boolean not null default true,
  renews_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index idx_subscriptions_active on public.subscriptions (user_id) where active = true;

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  opened_by uuid not null references public.users (id) on delete cascade,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolution text,
  resolved_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index idx_disputes_status on public.disputes (status);

create table public.worker_leads (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  worker_id uuid not null references public.users (id) on delete cascade,
  cost_cents int not null default 0,
  unlocked_at timestamptz not null default now(),
  unique (request_id, worker_id)
);

create index idx_worker_leads_worker on public.worker_leads (worker_id);

-- updated_at triggers
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tr_users_updated before update on public.users
  for each row execute function public.set_updated_at();
create trigger tr_worker_profiles_updated before update on public.worker_profiles
  for each row execute function public.set_updated_at();
create trigger tr_requests_updated before update on public.requests
  for each row execute function public.set_updated_at();
create trigger tr_orders_updated before update on public.orders
  for each row execute function public.set_updated_at();
create trigger tr_subscriptions_updated before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Realtime (Supabase Cloud): enable postgres changes
alter table public.orders replica identity full;
alter table public.requests replica identity full;
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.requests;

-- RLS: deny by default (service_role bypasses)
alter table public.users enable row level security;
alter table public.worker_profiles enable row level security;
alter table public.requests enable row level security;
alter table public.orders enable row level security;
alter table public.order_events enable row level security;
alter table public.reviews enable row level security;
alter table public.transactions enable row level security;
alter table public.subscriptions enable row level security;
alter table public.disputes enable row level security;
alter table public.worker_leads enable row level security;

create policy "deny_all_anon" on public.users for all using (false);
create policy "deny_all_anon_wp" on public.worker_profiles for all using (false);
create policy "deny_all_anon_req" on public.requests for all using (false);
create policy "deny_all_anon_ord" on public.orders for all using (false);
create policy "deny_all_anon_oe" on public.order_events for all using (false);
create policy "deny_all_anon_rev" on public.reviews for all using (false);
create policy "deny_all_anon_tx" on public.transactions for all using (false);
create policy "deny_all_anon_sub" on public.subscriptions for all using (false);
create policy "deny_all_anon_disp" on public.disputes for all using (false);
create policy "deny_all_anon_lead" on public.worker_leads for all using (false);
