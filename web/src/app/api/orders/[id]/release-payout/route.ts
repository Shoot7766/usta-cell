import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireRole } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { appendOrderEvent } from "@/lib/order-lifecycle";

const Params = z.object({ id: z.string().uuid() });

/**
 * Ish yakunlangach mijoz tasdig‘i: mijoz hamyoni yo‘q — to‘lov naqd/karta bo‘yicha kelishiladi;
 * platforma faqat ustaga daromad yozuvini qayd etadi.
 */
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
  const { data: o } = await sb
    .from("orders")
    .select("id, client_id, worker_id, status, price_cents, payout_released")
    .eq("id", id)
    .maybeSingle();
  if (!o || o.client_id !== ctx.userId) {
    return NextResponse.json({ error: "Topilmadi" }, { status: 404 });
  }
  if (o.status !== "completed") {
    return NextResponse.json(
      { error: "Faqat yakunlangan buyurtma uchun" },
      { status: 400 }
    );
  }
  if (o.payout_released) {
    return NextResponse.json({ error: "To'lov allaqachon tasdiqlangan" }, { status: 400 });
  }
  const price = (o.price_cents as number) || 0;
  const gross = Math.max(0, price);
  if (price <= 0) {
    return NextResponse.json({ error: "Buyurtma narxi noto'g'ri" }, { status: 400 });
  }
  const { data: wp } = await sb
    .from("worker_profiles")
    .select("earnings_balance_cents")
    .eq("user_id", o.worker_id as string)
    .maybeSingle();
  const prevEarn = (wp?.earnings_balance_cents as number) ?? 0;
  await sb
    .from("worker_profiles")
    .update({
      earnings_balance_cents: prevEarn + gross,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", o.worker_id as string);
  await sb.from("orders").update({ payout_released: true }).eq("id", id);
  await sb.from("transactions").insert({
    user_id: o.worker_id as string,
    order_id: id,
    type: "payout",
    amount_cents: gross,
    meta: { note: "Mijoz to‘lovni tasdiqladi (hamyon yo‘q)" },
  });
  await appendOrderEvent(id, "payout_released", { client: ctx.userId });
  return NextResponse.json({ ok: true, grossToWorkerCents: gross });
}
