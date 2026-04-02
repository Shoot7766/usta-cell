export const COMMISSION_BPS = Number(process.env.COMMISSION_BPS ?? 1200);
export const LEAD_UNLOCK_CENTS = Number(process.env.LEAD_UNLOCK_CENTS ?? 5000);
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

export const MATCH_WEIGHTS = {
  distance: 0.4,
  rating: 0.25,
  responseSpeed: 0.15,
  availability: 0.1,
  priceFit: 0.1,
} as const;
