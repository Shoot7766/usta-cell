export type PortfolioItem = { image_url: string; caption: string | null };

export function normalizePortfolioFromDb(raw: unknown): PortfolioItem[] {
  if (!Array.isArray(raw)) return [];
  const out: PortfolioItem[] = [];
  for (const x of raw) {
    if (typeof x !== "object" || !x) continue;
    const o = x as Record<string, unknown>;
    const u =
      (typeof o.image_url === "string" && o.image_url) ||
      (typeof o.imageUrl === "string" && o.imageUrl);
    if (!u || typeof u !== "string") continue;
    const url = u.trim();
    if (!/^https?:\/\//i.test(url) || url.length > 2048) continue;
    const cap = o.caption;
    const caption = typeof cap === "string" ? cap.trim().slice(0, 240) : null;
    out.push({ image_url: url, caption: caption || null });
    if (out.length >= 12) break;
  }
  return out;
}

export function portfolioPreview(items: PortfolioItem[], max = 4): PortfolioItem[] {
  return items.slice(0, max);
}
