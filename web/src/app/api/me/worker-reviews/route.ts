import { NextResponse } from "next/server";
import { requireSession, requireRole } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";

/** Usta o‘ziga kelgan mijoz sharhlari (buyurtmadan keyin). */
export async function GET() {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const denied = requireRole(ctx, ["worker"]);
  if (denied !== true) return denied;
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("reviews")
    .select("rating, comment, created_at")
    .eq("worker_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json({ error: "Yuklanmadi" }, { status: 500 });
  }
  return NextResponse.json({ reviews: data ?? [] });
}
