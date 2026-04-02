/**
 * Vercel / server loglarga mos JSON qatorlar (keyin Sentry qo‘shsa shu yerga ulanadi).
 */
export type LogLevel = "error" | "warn" | "info";

export function logStructured(
  level: LogLevel,
  msg: string,
  extra?: Record<string, unknown>
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    service: "usta-call",
    level,
    msg,
    ...extra,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function logAppError(
  source: string,
  err: unknown,
  extra?: Record<string, unknown>
): void {
  const e = err instanceof Error ? err : new Error(String(err));
  logStructured("error", e.message, {
    source,
    name: e.name,
    stack: e.stack,
    ...extra,
  });
}
