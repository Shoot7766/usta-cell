-- Mijoz hamyoni (so‘m, maydon nomi bilan mos: butun summa)
alter table public.users add column if not exists wallet_balance_cents int not null default 0;

-- Ustaga to‘lov mijoz tasdig‘idan keyin (oldingi completed buyurtmalar allaqachon hisoblangan deb belgilaymiz)
alter table public.orders add column if not exists payout_released boolean not null default false;

update public.orders
set payout_released = true
where status = 'completed';

-- Media (AI chat)
insert into storage.buckets (id, name, public)
values ('usta_chat', 'usta_chat', false)
on conflict (id) do nothing;
