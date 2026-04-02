/** GPS / Telegram joylashuvi bo‘lmasa — Toshkent atrofi zaxira. */
export const FALLBACK_REGION_LAT = 41.3111;
export const FALLBACK_REGION_LNG = 69.2797;
export const DEFAULT_WORKER_SERVICES = ["Umumiy ustachilik"] as const;
export const DEFAULT_PRICE_MIN_CENTS = 50_000;
export const DEFAULT_PRICE_MAX_CENTS = 500_000;

export function buildWorkerProfilePatch(lat: number, lng: number) {
  return {
    services: [...DEFAULT_WORKER_SERVICES],
    lat,
    lng,
    priceMinCents: DEFAULT_PRICE_MIN_CENTS,
    priceMaxCents: DEFAULT_PRICE_MAX_CENTS,
    isAvailable: true as const,
  };
}
