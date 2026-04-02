import { loadWebApp } from "./twa";

/** initDataUnsafe — faqat UI uchun; server tekshiruvi initData bilan. */
export async function getSuggestedDisplayNameFromTelegram(): Promise<string> {
  const WebApp = await loadWebApp();
  const u = WebApp.initDataUnsafe?.user;
  if (!u) return "";
  return [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
}

/**
 * Foydalanuvchi ruxsat berishi kerak — Telegram API telefonni shartsiz bermaydi.
 * Qaytadi: xalqaro formatdagi raqam yoki null.
 */
export async function requestTelegramContactPhone(): Promise<string | null> {
  const WebApp = await loadWebApp();
  if (typeof WebApp.requestContact !== "function") return null;
  return new Promise((resolve) => {
    WebApp.requestContact((access, response) => {
      if (!access || !response || response.status !== "sent") {
        resolve(null);
        return;
      }
      const raw = response.responseUnsafe?.contact?.phone_number;
      if (!raw) {
        resolve(null);
        return;
      }
      const digits = String(raw).replace(/\s/g, "");
      resolve(digits.startsWith("+") ? digits : `+${digits}`);
    });
  });
}
