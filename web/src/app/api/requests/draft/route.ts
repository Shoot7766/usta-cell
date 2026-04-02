import { NextResponse } from "next/server";
import { requireSession, requireRole } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";

/** Mijozning oxirgi «draft» suhbati — chat sahifasida tiklash uchun. */
export async function GET() {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const denied = requireRole(ctx, ["client"]);
  if (denied !== true) return denied;
  const sb = getServiceSupabase();
  const { data } = await sb
    .from("requests")
    .select(
      "id, status, conversation, structured, summary, category, urgency, tags, address, client_lat, client_lng, updated_at"
    )
    .eq("client_id", ctx.userId)
    .eq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) {
    return NextResponse.json({ request: null });
  }
  return NextResponse.json({ request: data });
}
