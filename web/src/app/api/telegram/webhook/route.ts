import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { fetchAdminStats, formatAdminStatsUz } from "@/lib/admin-stats";

const DEFAULT_PHRASE = "admin5555";

async function sendMessage(chatId: number, text: string) {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
}

/**
 * Telegram Bot API webhook. Sozlash: setWebhook → {APP_URL}/api/telegram/webhook
 * Xabar matni TELEGRAM_ADMIN_PHRASE (default: admin5555) bo‘lsa — statistika + admin havolasi.
 */
export async function POST(req: NextRequest) {
  const phrase = (process.env.TELEGRAM_ADMIN_PHRASE || DEFAULT_PHRASE).trim().toLowerCase();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }
  const msg = (body as { message?: { text?: string; chat?: { id: number } } }).message;
  if (!msg?.chat?.id) {
    return NextResponse.json({ ok: true });
  }
  const text = String(msg.text ?? "").trim().toLowerCase();
  if (text !== phrase) {
    return NextResponse.json({ ok: true });
  }
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
  try {
    const sb = getServiceSupabase();
    const stats = await fetchAdminStats(sb);
    const out = formatAdminStatsUz(stats, appUrl);
    await sendMessage(msg.chat.id, out);
  } catch {
    await sendMessage(
      msg.chat.id,
      `Statistika olinmadi. Admin panel: ${appUrl.replace(/\/$/, "") || ""}/admin`
    );
  }
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "Telegram webhook POST endpoint" });
}
