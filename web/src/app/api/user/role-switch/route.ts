import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import {
  signSession,
  sessionCookieOpts,
  SESSION_COOKIE_NAME,
} from "@/lib/session";
import type { Role } from "@/lib/types";

const Body = z.object({
  targetRole: z.enum(["client", "worker"]),
});

export async function POST(req: NextRequest) {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  if (ctx.role === "admin") {
    return NextResponse.json(
      { error: "Admin uchun almashtirish yo'q" },
      { status: 400 }
    );
  }
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Noto'g'ri so'rov" }, { status: 400 });
  }
  if (body.targetRole === ctx.role) {
    return NextResponse.json({ error: "Allaqachon shu rol" }, { status: 400 });
  }
  const sb = getServiceSupabase();
  const { data: u } = await sb
    .from("users")
    .select("id, display_name, phone")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (!u) {
    return NextResponse.json({ error: "Foydalanuvchi topilmadi" }, { status: 404 });
  }
  const newRole = body.targetRole as Role;
  const clientOk = Boolean(u.display_name && u.phone);
  await sb
    .from("users")
    .update({
      role: newRole,
      pending_role: null,
      role_switch_confirm_token: null,
      profile_completed: newRole === "worker" ? false : clientOk,
      onboarding_step:
        newRole === "worker"
          ? "worker_profile"
          : clientOk
            ? "done"
            : "client_profile",
      updated_at: new Date().toISOString(),
    })
    .eq("id", ctx.userId);
  if (newRole === "worker") {
    const { data: wp } = await sb
      .from("worker_profiles")
      .select("user_id")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (!wp) {
      await sb.from("worker_profiles").insert({
        user_id: ctx.userId,
        services: [],
        price_min_cents: 0,
        price_max_cents: 0,
        leads_balance_cents: 200000,
      });
    }
  }
  const jwt = await signSession({
    userId: ctx.userId,
    telegramId: ctx.telegramId,
    role: newRole,
  });
  const res = NextResponse.json({ ok: true, role: newRole });
  res.cookies.set(SESSION_COOKIE_NAME, jwt, sessionCookieOpts(14 * 24 * 3600));
  return res;
}
