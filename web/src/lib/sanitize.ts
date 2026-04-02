const MAX_LEN = 8000;

export function sanitizeText(input: unknown, max = 2000): string {
  if (typeof input !== "string") return "";
  const t = input.replace(/\u0000/g, "").trim().slice(0, Math.min(max, MAX_LEN));
  return t;
}

export function sanitizeStringArray(input: unknown, maxItems = 20): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((x): x is string => typeof x === "string")
    .map((s) => sanitizeText(s, 120))
    .filter(Boolean)
    .slice(0, maxItems);
}
