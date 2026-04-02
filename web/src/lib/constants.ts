/** Usta buyurtmani qabul qilganda (4-chi va keyingilar) — so‘m. */
export const ORDER_ACCEPT_FEE_CENTS = Number(
  process.env.ORDER_ACCEPT_FEE_CENTS ?? 10_000
);

/** Har bir usta uchun boshlang‘ich bepul qabul limiti. */
export const FREE_ORDER_ACCEPTS = Number(process.env.FREE_ORDER_ACCEPTS ?? 3);
export const CLIENT_CANCEL_PENALTY_CENTS = Number(
  process.env.CLIENT_CANCEL_PENALTY_CENTS ?? 15000
);
export const NO_SHOW_PENALTY_RATING = Number(
  process.env.NO_SHOW_PENALTY_RATING ?? 0.8
);
export const WORKER_CANCEL_RATING_DELTA = Number(
  process.env.WORKER_CANCEL_RATING ?? 0.35
);
export const FREE_TIER_DAILY_REQUEST_CAP = 5;
export const PRO_SUBSCRIPTION_CENTS_MONTH = 99000;
export const ARRIVAL_DEADLINE_MINUTES = 45;

/** Reyting va mos xizmat ustuvor (masofa ikkinchi o‘rinda). */
export const MATCH_WEIGHTS = {
  distance: 0.22,
  rating: 0.42,
  responseSpeed: 0.14,
  availability: 0.08,
  priceFit: 0.14,
} as const;
