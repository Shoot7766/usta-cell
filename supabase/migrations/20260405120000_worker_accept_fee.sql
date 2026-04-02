-- Usta: 3 ta bepul buyurtma qabuli, keyin har qabul uchun to‘lov (ilova mantig‘i bilan mos)
alter table public.worker_profiles
  add column if not exists free_order_accepts_remaining int not null default 3;

alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type in (
    'commission', 'subscription', 'lead_unlock', 'payout', 'penalty_client',
    'penalty_worker', 'refund', 'adjustment', 'order_accept_fee'
  ));
