import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireRole } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";

const Body = z.object({
  requestId: z.string().uuid(),
});

/** Bozor so‘rovi bo‘yicha mijoz kontakti — to‘lovsiz (qabul haqi alohida tizimda). */
export async function POST(req: NextRequest) {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const denied = requireRole(ctx, ["worker"]);
  if (denied !== true) return denied;
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Noto'g'ri" }, { status: 400 });
  }
  const sb = getServiceSupabase();
  const { data: existing } = await sb
    .from("worker_leads")
    .select("id")
    .eq("request_id", body.requestId)
    .eq("worker_id", ctx.userId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, already: true });
  }
  await sb.from("worker_leads").insert({
    request_id: body.requestId,
    worker_id: ctx.userId,
    cost_cents: 0,
  });
  const { data: ord } = await sb
    .from("orders")
    .select("id")
    .eq("request_id", body.requestId)
    .eq("worker_id", ctx.userId)
    .maybeSingle();
  if (ord?.id) {
    await sb.from("orders").update({ lead_unlock_cents: 0 }).eq("id", ord.id);
  }
  return NextResponse.json({ ok: true });
}
