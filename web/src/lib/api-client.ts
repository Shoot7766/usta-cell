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
  let body: unknown = null;
  try {
    body = await r.json();
  } catch {
    body = null;
  }
  const err =
    body && typeof body === "object" && "error" in body
      ? String((body as { error: string }).error)
      : undefined;
  if (!r.ok) {
    return { ok: false, error: err || r.statusText, status: r.status };
  }
  return { ok: true, data: body as T, status: r.status };
}
