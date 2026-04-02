-- Chek rasmi (URL) — admin tekshirishi uchun
alter table public.worker_topup_requests
  add column if not exists receipt_url text;

comment on column public.worker_topup_requests.receipt_url is 'Yuklangan chek rasmining ochiq URL';
