/** Draft ham bo‘lsa, AI xulosa/kategoriya bo‘lsa ustalar ro‘yxatiga ruxsat. */
export function requestEligibleForMatchFlow(r: {
  status: string;
  summary?: string | null;
  category?: string | null;
}): boolean {
  if (r.status === "submitted" || r.status === "matched") return true;
  if (r.status !== "draft") return false;
  const s = String(r.summary ?? "").trim();
  const c = String(r.category ?? "").trim();
  return s.length >= 2 || c.length >= 2;
}

/**
 * So‘rov matni (kategoriya, summary, teglar) va usta xizmatlari o‘rtasida sodda moslik.
 * "Kanalizatsiya" kabi so‘zlar santexnika xizmatlari bilan tutashadi.
 */
export function workerMatchesServiceBlob(
  workerServices: string[],
  blob: string
): boolean {
  const b = blob.toLowerCase().trim();
  if (!b) return true;
  const joined = workerServices.map((s) => s.toLowerCase()).join(" | ");
  const tokens = b
    .split(/[\s,.;:!?/\\[\]{}()—–-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);
  for (const t of tokens) {
    const head = t.slice(0, Math.min(t.length, 10));
    if (joined.includes(head)) return true;
  }
  const domainKeys: [RegExp, string[]][] = [
    [/kanalizats|hojatxona|unitaz|kran|suv oq|suv oqmay|quvur|sifon|santex/i, ["santex", "suv", "quvur", "kanal", "hojat", "plomb"]],
    [/elektr|rozet|lamp|sim|avtomat|schetchik|kabel/i, ["elektr", "rozet", "lamp", "sim", "kabel"]],
    [/plita|gaz|pech|ventilyats|kondits/i, ["plita", "gaz", "pech", "ventil", "kond"]],
  ];
  for (const [re, keys] of domainKeys) {
    if (!re.test(b)) continue;
    return workerServices.some((s) => {
      const sl = s.toLowerCase();
      return keys.some((k) => sl.includes(k));
    });
  }
  return workerServices.some((s) => {
    const sl = s.toLowerCase();
    return tokens.some((t) => sl.includes(t.slice(0, 6)));
  });
}

export function buildRequestServiceBlob(r: {
  category?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  structured?: unknown;
}): string {
  const struct = r.structured as { tags?: string[] } | null | undefined;
  const stags = Array.isArray(struct?.tags) ? struct.tags : [];
  const rtags = Array.isArray(r.tags) ? r.tags : [];
  return [r.category, r.summary, ...rtags, ...stags]
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .join(" ");
}
