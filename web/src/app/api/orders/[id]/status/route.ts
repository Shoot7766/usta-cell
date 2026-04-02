import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api-auth";
import { setOrderStatus } from "@/lib/order-lifecycle";
import type { OrderStatus } from "@/lib/types";
import { getServiceSupabase } from "@/lib/supabase/admin";

const Params = z.object({ id: z.string().uuid() });
const Body = z.object({
  status: z.enum(["accepted", "in_progress", "completed"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const { id } = Params.parse(params);
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Noto'g'ri" }, { status: 400 });
  }
  if (ctx.role !== "worker" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Ruxsat yo'q" }, { status: 403 });
  }
  const next = body.status as OrderStatus;
  const r = await setOrderStatus(id, next, {
    userId: ctx.userId,
    role: ctx.role === "admin" ? "admin" : "worker",
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  if (next === "completed") {
    const sb = getServiceSupabase();
    const { data: o } = await sb
      .from("orders")
      .select("price_cents, commission_cents, worker_id")
      .eq("id", id)
      .maybeSingle();
    if (o) {
      const gross = (o.price_cents as number) - (o.commission_cents as number);
      const { data: wp } = await sb
        .from("worker_profiles")
        .select("earnings_balance_cents")
        .eq("user_id", o.worker_id as string)
        .maybeSingle();
      const prev = (wp?.earnings_balance_cents as number) ?? 0;
      await sb
        .from("worker_profiles")
        .update({ earnings_balance_cents: prev + gross })
        .eq("user_id", o.worker_id as string);
      await sb.from("transactions").insert({
        user_id: o.worker_id as string,
        order_id: id,
        type: "payout",
        amount_cents: gross,
        meta: { note: "Buyurtma yakunlandi" },
      });
      await sb.from("transactions").insert({
        user_id: o.worker_id as string,
        order_id: id,
        type: "commission",
        amount_cents: -(o.commission_cents as number),
        meta: {},
      });
    }
  }
  return NextResponse.json({ ok: true });
}
