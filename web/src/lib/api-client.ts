export async function apiJson<T>(
  path: string,
  init?: RequestInit
): Promise<{ ok: boolean; data?: T; error?: string; status: number }> {
  const r = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    credentials: "include",
  });
  const text = await r.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = null;
    }
  }
  const err =
    body && typeof body === "object" && "error" in body
      ? String((body as { error: string }).error)
      : undefined;
  const detail =
    body && typeof body === "object" && "detail" in body && (body as { detail?: unknown }).detail
      ? String((body as { detail: unknown }).detail)
      : undefined;
  const combined = [err, detail].filter(Boolean).join(" — ");
  if (!r.ok) {
    const fallback =
      combined ||
      (text && text.length < 400 && !text.trimStart().startsWith("<")
        ? text
        : r.statusText) ||
      `HTTP ${r.status}`;
    return { ok: false, error: fallback, status: r.status };
  }
  return { ok: true, data: body as T, status: r.status };
}
