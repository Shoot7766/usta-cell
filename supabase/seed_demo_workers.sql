-- =============================================================================
-- DEMO USTALAR (faqat sinov uchun)
-- Supabase → SQL Editor da ishga tushiring. Avval barcha migratsiyalar qo‘llangan bo‘lsin.
-- Bu akkauntlar Telegram orqali KIRISH uchun emas — ular mijoz «ustalar ro‘yxati»da ko‘rinadi.
-- telegram_id: 9000000000001 … 9000000000006 (haqiqiy TG ID bilan to‘qnashmasligi kerak).
-- =============================================================================

insert into public.users (
  telegram_id,
  username,
  first_name,
  last_name,
  role,
  profile_completed,
  onboarding_step,
  display_name,
  phone
)
values
  (9000000000001, 'demo_elek_1', 'Akmal', 'Usta', 'worker', true, 'done', 'Akmal · Elektrik', '+998901100001'),
  (9000000000002, 'demo_santex_1', 'Jasur', 'Usta', 'worker', true, 'done', 'Jasur · Santex', '+998901100002'),
  (9000000000003, 'demo_universal', 'Rustam', 'Master', 'worker', true, 'done', 'Rustam · Universal', '+998901100003'),
  (9000000000004, 'demo_elek_2', 'Dilshod', 'Elektrik', 'worker', true, 'done', 'Dilshod Elektro', '+998901100004'),
  (9000000000005, 'demo_kanal', 'Farhod', 'Santex', 'worker', true, 'done', 'Farhod Kanalizatsiya', '+998901100005'),
  (9000000000006, 'demo_pro', 'Sardor', 'Pro', 'worker', true, 'done', 'Sardor Pro Usta', '+998901100006')
on conflict (telegram_id) do update set
  display_name = excluded.display_name,
  phone = excluded.phone,
  profile_completed = excluded.profile_completed,
  onboarding_step = excluded.onboarding_step,
  role = excluded.role,
  updated_at = now();

-- Toshkent atrofi — turli reyting va xizmatlar
insert into public.worker_profiles (
  user_id,
  bio,
  services,
  lat,
  lng,
  city_name,
  price_min_cents,
  price_max_cents,
  is_available,
  avg_response_seconds,
  rating_avg,
  rating_count,
  subscription_tier
)
select u.id,
  v.bio,
  v.services,
  v.lat,
  v.lng,
  'Toshkent',
  v.pmin,
  v.pmax,
  true,
  v.resp_sec,
  v.rating::numeric(3,2),
  v.rcount,
  v.tier
from public.users u
cross join lateral (
  values
    (9000000000001::bigint, '10 yillik elektr tajriba.'::text, array['Elektr montaj', 'Rozetka', 'Shitok']::text[], 41.315::float8, 69.282::float8, 120000, 450000, 420, 4.92::float, 56, 'free'::text),
    (9000000000002, 'Santexnika va suv quvurlari.', array['Santex montaj', 'Kanalizatsiya', 'Kranni almashtirish'], 41.305, 69.268, 90000, 380000, 900, 4.45, 23, 'free'),
    (9000000000003, 'Uy-joy ta’miri, elektr va santex.', array['Elektr', 'Santex', 'Montaj'], 41.298, 69.255, 150000, 600000, 1800, 4.78, 91, 'free'),
    (9000000000004, 'Tezkor elektr chaqiruv.', array['Elektr', 'Lampa', 'Rozetka'], 41.328, 69.301, 80000, 320000, 300, 4.15, 12, 'free'),
    (9000000000005, 'Kanalizatsiya va hojatxona.', array['Kanalizatsiya', 'Santex', 'Unitaz'], 41.288, 69.24, 100000, 420000, 600, 4.88, 34, 'free'),
    (9000000000006, 'Pro obuna — ustuvor chiqish.', array['Elektr', 'Santex', 'Konditsioner'], 41.31, 69.29, 200000, 800000, 480, 4.95, 120, 'pro')
) as v(tg_id, bio, services, lat, lng, pmin, pmax, resp_sec, rating, rcount, tier)
where u.telegram_id = v.tg_id
on conflict (user_id) do update set
  bio = excluded.bio,
  services = excluded.services,
  lat = excluded.lat,
  lng = excluded.lng,
  city_name = excluded.city_name,
  price_min_cents = excluded.price_min_cents,
  price_max_cents = excluded.price_max_cents,
  is_available = excluded.is_available,
  avg_response_seconds = excluded.avg_response_seconds,
  rating_avg = excluded.rating_avg,
  rating_count = excluded.rating_count,
  subscription_tier = excluded.subscription_tier,
  updated_at = now();
