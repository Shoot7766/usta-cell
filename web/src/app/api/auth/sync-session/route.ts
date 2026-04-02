import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import {
  signSession,
  sessionCookieOpts,
  SESSION_COOKIE_NAME,
} from "@/lib/session";
import type { Role } from "@/lib/types";

/** JWT dagi rol bazadan farq qilsa, cookie ni yangilaydi (admin panel / migratsiya keyin). */
export async function POST() {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const sb = getServiceSupabase();
  const { data: u } = await sb
    .from("users")
    .select("role")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (!u?.role) {
    return NextResponse.json({ error: "Foydalanuvchi topilmadi" }, { status: 404 });
  }
  const dbRole = u.role as Role;
  if (dbRole !== "client" && dbRole !== "worker" && dbRole !== "admin") {
    return NextResponse.json({ error: "Rol noto'g'ri" }, { status: 500 });
  }
  if (dbRole === ctx.role) {
    return NextResponse.json({ ok: true, synced: false, role: dbRole });
  }
  const jwt = await signSession({
    userId: ctx.userId,
    telegramId: ctx.telegramId,
    role: dbRole,
  });
  const res = NextResponse.json({ ok: true, synced: true, role: dbRole });
  res.cookies.set(SESSION_COOKIE_NAME, jwt, sessionCookieOpts(14 * 24 * 3600));
  return res;
}
