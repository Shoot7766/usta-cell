/**
 * Bot orqali usta / mijozga qisqa xabar (Mini App tashqarisida ham ko‘rinadi).
 */
export function parseTelegramChatId(raw: unknown): number | null {
  if (typeof raw === "bigint") {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === "string") {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

export async function sendTelegramText(chatId: number, text: string): Promise<boolean> {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token || !Number.isFinite(chatId)) return false;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 3900),
        disable_web_page_preview: true,
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function notifyWorkerNewOrder(opts: {
  workerTelegramId: number;
  orderId: string;
  contractNumber?: string;
  summary: string;
  appUrl?: string;
}): Promise<void> {
  const lines = [
    "🔔 Sizga buyurtma tushdi.",
    opts.contractNumber?.trim()
      ? `Shartnoma: ${opts.contractNumber.trim().slice(0, 40)}`
      : "",
    opts.summary.trim() ? opts.summary.trim().slice(0, 280) : "",
    "Mini ilovadan «Buyurtmalar» ni oching.",
  ].filter(Boolean);
  await sendTelegramText(opts.workerTelegramId, lines.join("\n"));
}

/** Usta buyurtmani qabul qilganda mijozga Telegram xabari. */
/** Usta bozordan so‘rovni band qilganda mijozga. */
export async function notifyClientMarketReserved(opts: {
  clientTelegramId: number;
  orderId: string;
  workerName: string;
  summary: string;
}): Promise<void> {
  const lines = [
    "📌 Usta so‘rovingizni band qildi.",
    "10 daqiqa ichida u ilovada tasdiqlashi yoki rad etishi kerak.",
    opts.workerName ? `Usta: ${opts.workerName}` : "",
    opts.summary.trim() ? opts.summary.trim().slice(0, 220) : "",
  ].filter(Boolean);
  await sendTelegramText(opts.clientTelegramId, lines.join("\n"));
}

export async function notifyClientWorkerAccepted(opts: {
  clientTelegramId: number;
  orderId: string;
  workerName: string;
  summary: string;
}): Promise<void> {
  const lines = [
    "✅ Usta buyurtmangizni qabul qildi.",
    opts.workerName ? `Usta: ${opts.workerName}` : "",
    opts.summary.trim() ? opts.summary.trim().slice(0, 220) : "",
    "Mini ilovadan «Buyurtmalar» ni oching.",
  ].filter(Boolean);
  await sendTelegramText(opts.clientTelegramId, lines.join("\n"));
}
