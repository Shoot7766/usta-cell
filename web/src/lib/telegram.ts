import crypto from "crypto";

export type TelegramWebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export function validateTelegramInitData(
  initData: string,
  botToken: string
): { valid: boolean; user?: TelegramWebAppUser; authDate?: number } {
  if (!initData || !botToken) return { valid: false };
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { valid: false };
  params.delete("hash");
  const entries = Array.from(params.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");
  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const computed = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");
  if (computed !== hash) return { valid: false };
  const authDateRaw = params.get("auth_date");
  const authDate = authDateRaw ? parseInt(authDateRaw, 10) : NaN;
  if (!Number.isFinite(authDate)) return { valid: false };
  const maxAge = 24 * 60 * 60;
  if (Math.floor(Date.now() / 1000) - authDate > maxAge) {
    return { valid: false };
  }
  const userRaw = params.get("user");
  if (!userRaw) return { valid: true, authDate };
  try {
    const user = JSON.parse(userRaw) as TelegramWebAppUser;
    if (!user || typeof user.id !== "number") return { valid: true, authDate };
    return { valid: true, user, authDate };
  } catch {
    return { valid: true, authDate };
  }
}
