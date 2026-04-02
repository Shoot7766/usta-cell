-- Bozordan «Band qilish»: usta tasdiqlash/rad muddati va holat
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in (
  'pending_worker', 'new', 'accepted', 'in_progress', 'completed', 'canceled'
));

alter table public.orders
  add column if not exists worker_decision_deadline_at timestamptz;

comment on column public.orders.worker_decision_deadline_at is
  'Bozordan band qilinganda tasdiqlash/rad tugmalari muddati (o‘tib ketsa jarima va bekor)';
