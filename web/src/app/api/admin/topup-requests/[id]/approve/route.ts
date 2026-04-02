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
  const denied = requireRole(ctx, ["admin"]);
  if (denied !== true) return denied;
  const { id } = Params.parse(params);
  const sb = getServiceSupabase();
  const { data: reqRow } = await sb
    .from("worker_topup_requests")
    .select("id, worker_id, amount_cents, status")
    .eq("id", id)
    .maybeSingle();
  if (!reqRow || reqRow.status !== "pending") {
    return NextResponse.json({ error: "So'rov topilmadi yoki allaqachon hal qilingan" }, { status: 400 });
  }
  const workerId = reqRow.worker_id as string;
  const amount = reqRow.amount_cents as number;
  const { data: wp } = await sb
    .from("worker_profiles")
    .select("leads_balance_cents")
    .eq("user_id", workerId)
    .maybeSingle();
  if (!wp) {
    return NextResponse.json({ error: "Usta profili yo'q" }, { status: 400 });
  }
  const cur = (wp.leads_balance_cents as number) ?? 0;
  const next = cur + amount;
  const now = new Date().toISOString();
  await sb
    .from("worker_profiles")
    .update({ leads_balance_cents: next, updated_at: now })
    .eq("user_id", workerId);
  await sb
    .from("worker_topup_requests")
    .update({
      status: "approved",
      resolved_at: now,
      resolved_by: ctx.userId,
    })
    .eq("id", id);
  await sb.from("transactions").insert({
    user_id: workerId,
    order_id: null,
    type: "adjustment",
    amount_cents: amount,
    meta: { note: "Admin tasdig‘i: qabul balansi to‘ldirish", topup_request_id: id },
  });
  return NextResponse.json({ ok: true, leadsBalanceCents: next });
}
