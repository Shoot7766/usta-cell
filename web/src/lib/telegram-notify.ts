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
  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const link = base ? `${base}/worker/order/${opts.orderId}` : "";
  const lines = [
    "🔔 Sizga buyurtma tushdi.",
    opts.contractNumber?.trim()
      ? `Shartnoma: ${opts.contractNumber.trim().slice(0, 40)}`
      : "",
    opts.summary.trim() ? opts.summary.trim().slice(0, 280) : "",
    link ? `Ilova: ${link}` : "Mini ilovadan «Buyurtmalar» ni oching.",
  ].filter(Boolean);
  await sendTelegramText(opts.workerTelegramId, lines.join("\n"));
}

/** Usta buyurtmani qabul qilganda mijozga Telegram xabari. */
export async function notifyClientWorkerAccepted(opts: {
  clientTelegramId: number;
  orderId: string;
  workerName: string;
  summary: string;
}): Promise<void> {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const link = base ? `${base}/client/order/${opts.orderId}` : "";
  const lines = [
    "✅ Usta buyurtmangizni qabul qildi.",
    opts.workerName ? `Usta: ${opts.workerName}` : "",
    opts.summary.trim() ? opts.summary.trim().slice(0, 220) : "",
    link ? `Kuzatuv: ${link}` : "Mini ilovadan «Buyurtmalar» ni oching.",
  ].filter(Boolean);
  await sendTelegramText(opts.clientTelegramId, lines.join("\n"));
}
