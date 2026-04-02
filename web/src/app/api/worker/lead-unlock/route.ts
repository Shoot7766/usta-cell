import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireRole } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { LEAD_UNLOCK_CENTS } from "@/lib/constants";

const Body = z.object({
  requestId: z.string().uuid(),
});

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
  const { data: wp } = await sb
    .from("worker_profiles")
    .select("leads_balance_cents")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  const bal = (wp?.leads_balance_cents as number) ?? 0;
  if (bal < LEAD_UNLOCK_CENTS) {
    return NextResponse.json(
      { error: "Balans yetarli emas. Hisobni to'ldiring.", need: LEAD_UNLOCK_CENTS, bal },
      { status: 402 }
    );
  }
  await sb
    .from("worker_profiles")
    .update({ leads_balance_cents: bal - LEAD_UNLOCK_CENTS })
    .eq("user_id", ctx.userId);
  await sb.from("worker_leads").insert({
    request_id: body.requestId,
    worker_id: ctx.userId,
    cost_cents: LEAD_UNLOCK_CENTS,
  });
  await sb.from("transactions").insert({
    user_id: ctx.userId,
    type: "lead_unlock",
    amount_cents: -LEAD_UNLOCK_CENTS,
    meta: { request_id: body.requestId },
  });
  const { data: ord } = await sb
    .from("orders")
    .select("id")
    .eq("request_id", body.requestId)
    .eq("worker_id", ctx.userId)
    .maybeSingle();
  if (ord?.id) {
    await sb
      .from("orders")
      .update({ lead_unlock_cents: LEAD_UNLOCK_CENTS })
      .eq("id", ord.id);
  }
  return NextResponse.json({ ok: true, paid: LEAD_UNLOCK_CENTS });
}
