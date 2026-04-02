-- Buyurtma shartnoma raqami (global ketma-ketlik) + usta portfeli (rasmlar JSON)
create sequence if not exists public.order_contract_seq;

create or replace function public.next_order_contract_number()
returns text
language sql
volatile
as $$
  select 'Sh-' || to_char((now() at time zone 'Asia/Tashkent')::date, 'YYYY') || '-' ||
         lpad(nextval('public.order_contract_seq')::text, 7, '0');
$$;

alter table public.orders add column if not exists contract_number text;

update public.orders o
set contract_number = public.next_order_contract_number()
where o.contract_number is null;

create unique index if not exists orders_contract_number_uidx on public.orders (contract_number);

alter table public.orders
  alter column contract_number set default public.next_order_contract_number();

alter table public.orders
  alter column contract_number set not null;

alter table public.worker_profiles add column if not exists portfolio jsonb not null default '[]'::jsonb;
