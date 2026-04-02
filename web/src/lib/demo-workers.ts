/** Seed / sinov akkauntlari (telegram_id blok) — ro‘yxatdan chiqariladi. */
const DEMO_TELEGRAM_MIN = 9_000_000_000_000;
const DEMO_TELEGRAM_MAX = 9_000_000_000_099;

export function isDemoTelegramId(tid: unknown): boolean {
  const n =
    typeof tid === "bigint"
      ? Number(tid)
      : typeof tid === "string"
        ? Number(tid)
        : typeof tid === "number"
          ? tid
          : NaN;
  if (!Number.isFinite(n)) return false;
  return n >= DEMO_TELEGRAM_MIN && n <= DEMO_TELEGRAM_MAX;
}
