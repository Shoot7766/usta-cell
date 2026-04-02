import { MATCH_WEIGHTS } from "./constants";
import type { ScoredWorker, WorkerMatchRow, MatchBadge } from "./types";

function asBadges(xs: string[]): MatchBadge[] {
  const allowed: MatchBadge[] = ["top_worker", "fast_response", "nearby"];
  return xs.filter((x): x is MatchBadge => allowed.includes(x as MatchBadge));
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function normDistance(km: number | null): number {
  if (km == null || !Number.isFinite(km)) return 0.35;
  const d = Math.min(km, 50) / 50;
  return Math.max(0, 1 - d);
}

function normRating(avg: number, count: number): number {
  const w = Math.min(count, 50) / 50;
  const base = Math.max(0, Math.min(5, avg)) / 5;
  return 0.4 + 0.6 * base * (0.5 + 0.5 * w);
}

function normResponse(sec: number): number {
  const s = Math.max(60, Math.min(sec, 7200));
  return 1 - (s - 60) / (7200 - 60);
}

function normPriceFit(
  workerMin: number,
  workerMax: number,
  reqMin?: number | null,
  reqMax?: number | null
): number {
  if (reqMin == null && reqMax == null) return 0.75;
  const rMin = reqMin ?? workerMin;
  const rMax = reqMax ?? workerMax;
  const wMid = (workerMin + workerMax) / 2 || 1;
  const rMid = (rMin + rMax) / 2 || wMid;
  const overlap =
    Math.min(workerMax, rMax) - Math.max(workerMin, rMin);
  if (overlap >= 0) return 0.9;
  const gap = Math.abs(rMid - wMid) / Math.max(wMid, 1);
  return Math.max(0, 1 - Math.min(gap / 2, 1));
}

export function attachDistance(
  workers: Omit<WorkerMatchRow, "distance_km">[],
  clientLat?: number | null,
  clientLng?: number | null
): WorkerMatchRow[] {
  return workers.map((w) => {
    let distance_km: number | null = null;
    if (
      clientLat != null &&
      clientLng != null &&
      w.lat != null &&
      w.lng != null
    ) {
      distance_km = haversineKm(clientLat, clientLng, w.lat, w.lng);
    }
    return { ...w, distance_km };
  });
}

export function scoreWorkers(
  rows: WorkerMatchRow[],
  opts: { requestMinCents?: number | null; requestMaxCents?: number | null }
): ScoredWorker[] {
  const withParts = rows.map((w) => {
    const d = normDistance(w.distance_km);
    const r = normRating(Number(w.rating_avg), w.rating_count);
    const resp = normResponse(w.avg_response_seconds);
    const avail = w.is_available ? 1 : 0.2;
    const price = normPriceFit(
      w.price_min_cents,
      w.price_max_cents,
      opts.requestMinCents,
      opts.requestMaxCents
    );
    const proBoost = w.subscription_tier === "pro" ? 0.04 : 0;
    const score =
      MATCH_WEIGHTS.distance * d +
      MATCH_WEIGHTS.rating * r +
      MATCH_WEIGHTS.responseSpeed * resp +
      MATCH_WEIGHTS.availability * avail +
      MATCH_WEIGHTS.priceFit * price +
      proBoost;
    const badges: MatchBadge[] = [];
    if (w.distance_km != null && w.distance_km <= 3) badges.push("nearby");
    if (w.avg_response_seconds <= 600) badges.push("fast_response");
    return { ...w, score, badges };
  });
  const sorted = [...withParts].sort((a, b) => b.score - a.score);
  if (sorted[0]) {
    sorted[0].badges = asBadges(
      Array.from(new Set([...sorted[0].badges, "top_worker"]))
    );
  }
  return sorted;
}
