-- Mijoz chatda yuborgan oxirgi rasm — buyurtmada ustaga ko‘rinadi
alter table public.requests add column if not exists last_client_image_path text;

alter table public.orders add column if not exists client_issue_image_path text;

comment on column public.requests.last_client_image_path is 'usta_chat bucket ichidagi yo‘l (client_id/uuid.ext)';
comment on column public.orders.client_issue_image_path is 'Buyurtma yaratilganda nusxalanadi — mijoz muammosi rasmi';
