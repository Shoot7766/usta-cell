import crypto from "crypto";

export type TelegramWebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export type TelegramInitResult =
  | { ok: true; user: TelegramWebAppUser; authDate: number }
  | { ok: false; code: string };

/**
 * Telegram Web Apps initData tekshiruvi (Bot API hujjatidagi algoritm).
 * botToken bo'sh joy bilan tugasa HMAC yiqiladi — trim qilingan token ishlatiladi.
 */
export function validateTelegramInitData(
  initData: string,
  botToken: string
): TelegramInitResult {
  const token = botToken.trim();
  if (!initData || !token) return { ok: false, code: "missing_token_or_data" };
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, code: "missing_hash" };
  params.delete("hash");
  const entries = Array.from(params.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");
  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(token)
    .digest();
  const computed = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");
  if (computed !== hash) return { ok: false, code: "bad_hash" };
  const authDateRaw = params.get("auth_date");
  const authDate = authDateRaw ? parseInt(authDateRaw, 10) : NaN;
  if (!Number.isFinite(authDate)) return { ok: false, code: "bad_auth_date" };
  const maxAge = 24 * 60 * 60;
  if (Math.floor(Date.now() / 1000) - authDate > maxAge) {
    return { ok: false, code: "expired" };
  }
  const userRaw = params.get("user");
  if (!userRaw) return { ok: false, code: "no_user" };
  try {
    const user = JSON.parse(userRaw) as TelegramWebAppUser;
    if (!user || typeof user.id !== "number") {
      return { ok: false, code: "invalid_user_json" };
    }
    return { ok: true, user, authDate };
  } catch {
    return { ok: false, code: "invalid_user_json" };
  }
}
