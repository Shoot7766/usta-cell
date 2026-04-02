/** Usta ko‘p tanlov — xizmat turlari (match va profil bilan mos). */
export const WORKER_TRADE_OPTIONS = [
  "Santex montaj",
  "Elektr montaj",
  "Konditsioner",
  "Mebel yig‘ish",
  "Bo‘yoq, ta’mir",
  "Qoplamalar (pol, laminat)",
  "Deraza, eshik",
  "Tom, chovqa",
  "Kanalizatsiya",
  "Umumiy ta’mir",
] as const;

export type WorkerTradeId = (typeof WORKER_TRADE_OPTIONS)[number];
