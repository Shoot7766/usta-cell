/** GPS / Telegram joylashuvi bo‘lmasa — Toshkent atrofi zaxira. */
export const FALLBACK_REGION_LAT = 41.3111;
export const FALLBACK_REGION_LNG = 69.2797;

export function buildWorkerProfilePatch(lat: number, lng: number) {
  return {
    services: [] as string[],
    lat,
    lng,
    priceMinCents: 0,
    priceMaxCents: 0,
    isAvailable: true as const,
  };
}
