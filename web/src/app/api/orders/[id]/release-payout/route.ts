import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireRole } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { appendOrderEvent } from "@/lib/order-lifecycle";

const Params = z.object({ id: z.string().uuid() });

/**
 * Ish yakunlangach mijoz tasdig‘i: hamyondan summa yechiladi, usta balansiga o‘tkaziladi.
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
    .select(
      "id, client_id, worker_id, status, price_cents, commission_cents, payout_released"
    )
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
    return NextResponse.json({ error: "To'lov allaqachon o'tkazilgan" }, { status: 400 });
  }
  const price = (o.price_cents as number) || 0;
  const commission = (o.commission_cents as number) || 0;
  const gross = Math.max(0, price - commission);
  if (price <= 0) {
    return NextResponse.json({ error: "Buyurtma narxi noto'g'ri" }, { status: 400 });
  }
  const { data: client } = await sb
    .from("users")
    .select("wallet_balance_cents")
    .eq("id", ctx.userId)
    .single();
  const bal = (client?.wallet_balance_cents as number) ?? 0;
  if (bal < price) {
    return NextResponse.json(
      {
        error: `Hamyon yetarli emas. Kerak: ${price.toLocaleString()} so'm, balans: ${bal.toLocaleString()} so'm`,
        needCents: price,
        haveCents: bal,
      },
      { status: 400 }
    );
  }
  const { data: wp } = await sb
    .from("worker_profiles")
    .select("earnings_balance_cents")
    .eq("user_id", o.worker_id as string)
    .maybeSingle();
  const prevEarn = (wp?.earnings_balance_cents as number) ?? 0;
  await sb
    .from("users")
    .update({
      wallet_balance_cents: bal - price,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ctx.userId);
  await sb
    .from("worker_profiles")
    .update({
      earnings_balance_cents: prevEarn + gross,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", o.worker_id as string);
  await sb.from("orders").update({ payout_released: true }).eq("id", id);
  await sb.from("transactions").insert({
    user_id: ctx.userId,
    order_id: id,
    type: "penalty_client",
    amount_cents: -price,
    meta: { note: "Buyurtma to'lovi (hamyon)" },
  });
  await sb.from("transactions").insert({
    user_id: o.worker_id as string,
    order_id: id,
    type: "payout",
    amount_cents: gross,
    meta: { note: "Mijoz tasdig'i bilan" },
  });
  if (commission > 0) {
    await sb.from("transactions").insert({
      user_id: o.worker_id as string,
      order_id: id,
      type: "commission",
      amount_cents: -commission,
      meta: {},
    });
  }
  await appendOrderEvent(id, "payout_released", { client: ctx.userId });
  return NextResponse.json({ ok: true, grossToWorkerCents: gross });
}
