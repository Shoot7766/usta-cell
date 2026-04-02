import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireRole } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";

const Body = z.object({
  amountCents: z.number().int().min(10_000).max(50_000_000),
});

/** Usta buyurtma qabul balansini to‘ldirish (demo; keyin to‘lov provayderi). */
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
  const day = rateLimit(`leadsdep:${ctx.userId}`, 25, 86_400_000);
  if (!day.ok) {
    return NextResponse.json({ error: "Kunlik limit" }, { status: 429 });
  }
  const sb = getServiceSupabase();
  const { data: wp } = await sb
    .from("worker_profiles")
    .select("leads_balance_cents")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!wp) {
    return NextResponse.json({ error: "Usta profili topilmadi" }, { status: 404 });
  }
  const cur = (wp.leads_balance_cents as number) ?? 0;
  const next = cur + body.amountCents;
  await sb
    .from("worker_profiles")
    .update({ leads_balance_cents: next, updated_at: new Date().toISOString() })
    .eq("user_id", ctx.userId);
  await sb.from("transactions").insert({
    user_id: ctx.userId,
    order_id: null,
    type: "adjustment",
    amount_cents: body.amountCents,
    meta: { note: "Buyurtma qabul balansi (demo to'ldirish)" },
  });
  return NextResponse.json({ ok: true, leadsBalanceCents: next });
}
