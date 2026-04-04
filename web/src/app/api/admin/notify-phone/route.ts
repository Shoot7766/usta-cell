import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireRole } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { normalizeUzbekPhone } from "@/lib/openai/classifier";

async function sendBotMessage(telegramId: number, text: string): Promise<boolean> {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token || telegramId <= 0) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: telegramId, text, parse_mode: "HTML" }),
    });
    const json = (await res.json()) as { ok?: boolean };
    return json.ok === true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const denied = requireRole(ctx, ["admin"]);
  if (denied !== true) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON noto'g'ri" }, { status: 400 });
  }

  const rawPhone = typeof body.phone === "string" ? body.phone.trim() : "";
  if (!rawPhone) {
    return NextResponse.json({ error: "phone kerak" }, { status: 400 });
  }

  const phone = normalizeUzbekPhone(rawPhone) ?? rawPhone;
  const message =
    typeof body.message === "string" && body.message.trim()
      ? body.message.trim()
      : `✅ <b>Usta Call:</b> Sizning profilingiz/e'loningiz tizimda mavjud.\n\nBatafsil: ${(process.env.NEXT_PUBLIC_APP_URL || "").trim()}`;

  const sb = getServiceSupabase();

  // Check if real user with this phone exists
  const { data: user } = await sb
    .from("users")
    .select("id, telegram_id, display_name")
    .eq("phone", phone)
    .gt("telegram_id", 0)
    .maybeSingle();

  if (!user?.telegram_id) {
    // Check synthetic user (has profile but not in Telegram bot yet)
    const { data: synUser } = await sb
      .from("users")
      .select("id, display_name, phone")
      .eq("phone", phone)
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      ok: false,
      found: !!synUser,
      notified: false,
      reason: synUser
        ? "Foydalanuvchi topildi lekin bot bilan suhbat boshlamagan"
        : "Bu raqamli foydalanuvchi topilmadi",
    });
  }

  const tgId = Number(user.telegram_id);
  const sent = await sendBotMessage(tgId, message);

  return NextResponse.json({
    ok: sent,
    found: true,
    notified: sent,
    displayName: user.display_name,
    reason: sent ? null : "Telegram xabar yuborilmadi (bot bloklanganmi?)",
  });
}
