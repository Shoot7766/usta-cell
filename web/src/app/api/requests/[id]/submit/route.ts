import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireRole } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";

const Params = z.object({ id: z.string().uuid() });

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const denied = requireRole(ctx, ["client"]);
  if (denied !== true) return denied;
  const { id } = Params.parse(params);
  const sb = getServiceSupabase();
  const { data: r } = await sb
    .from("requests")
    .select("id, client_id, summary, category")
    .eq("id", id)
    .maybeSingle();
  if (!r || r.client_id !== ctx.userId) {
    return NextResponse.json({ error: "Topilmadi" }, { status: 404 });
  }
  if (!r.summary) {
    return NextResponse.json({ error: "Avval AI suhbatini yakunlang" }, { status: 400 });
  }
  await sb
    .from("requests")
    .update({
      status: "submitted",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  return NextResponse.json({ ok: true });
}
