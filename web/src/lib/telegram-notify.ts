/**
 * Bot orqali usta / mijozga qisqa xabar (Mini App tashqarisida ham ko‘rinadi).
 */
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
  summary: string;
  appUrl?: string;
}): Promise<void> {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const link = base ? `${base}/worker/order/${opts.orderId}` : "";
  const lines = [
    "🔔 Sizga buyurtma tushdi.",
    opts.summary.trim() ? opts.summary.trim().slice(0, 280) : "",
    link ? `Ilova: ${link}` : "Mini ilovadan «Buyurtmalar» ni oching.",
  ].filter(Boolean);
  await sendTelegramText(opts.workerTelegramId, lines.join("\n"));
}
