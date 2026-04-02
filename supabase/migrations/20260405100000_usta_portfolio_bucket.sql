-- Portfolio rasmlari: ochiq o‘qish, yuklash faqat server (service_role) orqali
insert into storage.buckets (id, name, public)
values ('usta_portfolio', 'usta_portfolio', true)
on conflict (id) do update set public = true;
