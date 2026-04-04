import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { fetchAdminStats, formatAdminStatsUz } from "@/lib/admin-stats";
import { importFromExternal, linkProfilesByPhone } from "@/lib/external-import";
import { normalizeUzbekPhone } from "@/lib/openai/classifier";

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

/* ── Telegram types ─────────────────────────────────────────────────────── */

type TgChat = { id: number; type?: string; username?: string; title?: string };
type TgContact = { phone_number?: string };
type TgFrom = { id: number; first_name?: string; last_name?: string; username?: string };
type TgMessage = {
  message_id?: number;
  text?: string;
  caption?: string;
  chat?: TgChat;
  from?: TgFrom;
  contact?: TgContact;
  author_signature?: string;
};
type TgUpdate = {
  message?: TgMessage;
  channel_post?: TgMessage;
  edited_channel_post?: TgMessage;
};

/* ── Channel import helpers ──────────────────────────────────────────────── */

function isAllowedImportChannel(chat: TgChat): boolean {
  const raw = (process.env.TELEGRAM_IMPORT_CHANNEL_IDS || "").trim();
  if (!raw) return false;
  const items = raw.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (items.includes("*")) return true;
  const chatId = String(chat.id).toLowerCase();
  const username = (chat.username || "").toLowerCase();
  return (
    items.includes(chatId) ||
    (username ? items.includes(username) || items.includes(`@${username}`) : false)
  );
}

function postSourceUrl(post: TgMessage): string | undefined {
  const u = (post.chat?.username || "").trim();
  const id = Number(post.message_id || 0);
  if (!u || !id) return undefined;
  return `https://t.me/${u}/${id}`;
}

async function handleChannelPost(post: TgMessage, rawUpdate: TgUpdate): Promise<void> {
  const chat = post.chat;
  if (!chat?.id || chat.type !== "channel") return;
  if (!isAllowedImportChannel(chat)) return;
  const text = (post.text ?? post.caption ?? "").trim();
  if (!text) return;
  await importFromExternal({
    provider: "telegram",
    providerLabel: chat.title || chat.username || "Telegram",
    sourceUrl: postSourceUrl(post),
    messageText: text,
    contactName: post.author_signature || chat.title,
    contactHandle: chat.username ? `@${chat.username}` : undefined,
    externalChatId: String(chat.id),
    externalMessageId: post.message_id ? String(post.message_id) : undefined,
    rawPayload: rawUpdate as unknown as Record<string, unknown>,
  });
}

/* ── Contact sharing handler ─────────────────────────────────────────────── */

async function handleContactShare(msg: TgMessage): Promise<boolean> {
  const rawPhone = msg.contact?.phone_number;
  if (!rawPhone || !msg.from?.id) return false;
  const phone = normalizeUzbekPhone(rawPhone);
  if (!phone) return false;
  const from = msg.from;
  const displayName = [from.first_name, from.last_name].filter(Boolean).join(" ") || null;
  const result = await linkProfilesByPhone(
    phone,
    from.id,
    displayName,
    from.username ?? null
  );
  return result.workerLinked || result.clientLinked;
}

/**
 * Telegram Bot API webhook. Sozlash: setWebhook → {APP_URL}/api/telegram/webhook
 * Xabar matni TELEGRAM_ADMIN_PHRASE (default: admin5555) bo'lsa — statistika + admin havolasi.
 * Kanal postlari TELEGRAM_IMPORT_CHANNEL_IDS ro'yxatidan bo'lsa — import qilinadi.
 */
export async function POST(req: NextRequest) {
  const phrase = (process.env.TELEGRAM_ADMIN_PHRASE || DEFAULT_PHRASE).trim().toLowerCase();
  let body: TgUpdate;
  try {
    body = (await req.json()) as TgUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  // ── Channel post import
  const post = body.channel_post ?? body.edited_channel_post;
  if (post) {
    void handleChannelPost(post, body);
    return NextResponse.json({ ok: true });
  }

  const msg = body.message;
  if (!msg?.chat?.id) {
    return NextResponse.json({ ok: true });
  }

  // ── Contact share → link pending profiles
  if (msg.contact) {
    void handleContactShare(msg);
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
