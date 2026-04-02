import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { validateTelegramInitData } from "@/lib/telegram";
import { signSession, sessionCookieOpts, SESSION_COOKIE_NAME } from "@/lib/session";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import type { Role } from "@/lib/types";

const Body = z.object({
  initData: z.string().min(10),
});

const TG_ERRORS: Record<string, string> = {
  missing_token_or_data: "Server: TELEGRAM_BOT_TOKEN tekshiring (Vercel Environment).",
  missing_hash: "Telegram initData noto‘g‘ri.",
  bad_hash:
    "Bot token noto‘g‘ri yoki Mini App boshqa botga ulangan. Vercelda TELEGRAM_BOT_TOKEN shu botga tegishli bo‘lsin.",
  bad_auth_date: "Telegram vaqt ma'lumoti noto‘g‘ri.",
  expired: "Sessiya eskirgan. Telegramda ilovani yoping va qayta oching.",
  no_user: "Telegram foydalanuvchi ma'lumoti kelmadi.",
  invalid_user_json: "Telegram user JSON noto‘g‘ri.",
};

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req.headers);
    const rl = rateLimit(`auth:${ip}`, 30, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Juda ko'p urinish" },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
        }
      );
    }
    let body: z.infer<typeof Body>;
    try {
      body = Body.parse(await req.json());
    } catch {
      return NextResponse.json({ error: "Noto'g'ri so'rov" }, { status: 400 });
    }
    const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
    if (!token) {
      return NextResponse.json({ error: "Server sozlanmagan" }, { status: 500 });
    }
    const v = validateTelegramInitData(body.initData, token);
    if (!v.ok) {
      const msg = TG_ERRORS[v.code] || "Telegram tekshiruvi muvaffaqiyatsiz";
      return NextResponse.json({ error: msg, code: v.code }, { status: 401 });
    }
    const tg = v.user;
    let sb;
    try {
      sb = getServiceSupabase();
    } catch {
      return NextResponse.json(
        {
          error:
            "Supabase sozlanmagan: NEXT_PUBLIC_SUPABASE_URL va SUPABASE_SERVICE_ROLE_KEY (Vercel Environment).",
        },
        { status: 500 }
      );
    }
    const telegram_id = tg.id;
    const { data: existing } = await sb
      .from("users")
      .select("id, role, profile_completed")
      .eq("telegram_id", telegram_id)
      .maybeSingle();
    let userId: string;
    let role: Role;
    if (existing) {
      userId = existing.id as string;
      role = existing.role as Role;
      await sb
        .from("users")
        .update({
          username: tg.username ?? null,
          first_name: tg.first_name ?? null,
          last_name: tg.last_name ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
    } else {
      const { data: ins, error } = await sb
        .from("users")
        .insert({
          telegram_id,
          username: tg.username ?? null,
          first_name: tg.first_name ?? null,
          last_name: tg.last_name ?? null,
          role: "client",
          profile_completed: false,
          onboarding_step: "role",
        })
        .select("id, role")
        .single();
      if (error || !ins) {
        return NextResponse.json(
          {
            error:
              "Foydalanuvchi yaratilmadi. Supabase’da migratsiya qo‘llanganmi va jadval bormi?",
            detail: error?.message,
          },
          { status: 500 }
        );
      }
      userId = ins.id as string;
      role = ins.role as Role;
    }
    let jwt: string;
    try {
      jwt = await signSession({
        userId,
        telegramId: String(telegram_id),
        role,
      });
    } catch {
      return NextResponse.json(
        {
          error:
            "SESSION_SECRET Vercelda yo‘q yoki 32 belgidan qisqa. Environment Variables’da 32+ belgilik maxfiy qator qo‘ying.",
        },
        { status: 500 }
      );
    }
    const res = NextResponse.json({
      ok: true,
      userId,
      role,
      profileCompleted: Boolean(existing?.profile_completed),
    });
    res.cookies.set(SESSION_COOKIE_NAME, jwt, sessionCookieOpts(14 * 24 * 3600));
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server xatosi";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
