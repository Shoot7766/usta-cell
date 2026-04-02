import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireRole } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { computeCommission, appendOrderEvent } from "@/lib/order-lifecycle";

const Body = z.object({
  requestId: z.string().uuid(),
  workerId: z.string().uuid(),
  priceCents: z.number().int().positive().max(500_000_000),
  etaMinutes: z.number().int().min(5).max(24 * 60),
});

export async function POST(req: NextRequest) {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const denied = requireRole(ctx, ["client"]);
  if (denied !== true) return denied;
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Noto'g'ri" }, { status: 400 });
  }
  const sb = getServiceSupabase();
  const { data: r } = await sb
    .from("requests")
    .select("*")
    .eq("id", body.requestId)
    .maybeSingle();
  if (!r || r.client_id !== ctx.userId) {
    return NextResponse.json({ error: "So'rov topilmadi" }, { status: 404 });
  }
  if (r.status !== "submitted" && r.status !== "matched") {
    return NextResponse.json({ error: "So'rov holati mos emas" }, { status: 400 });
  }
  const { data: wu } = await sb
    .from("users")
    .select("id, role")
    .eq("id", body.workerId)
    .maybeSingle();
  if (!wu || wu.role !== "worker") {
    return NextResponse.json({ error: "Usta topilmadi" }, { status: 400 });
  }
  const commission = computeCommission(body.priceCents);
  const { data: ord, error } = await sb
    .from("orders")
    .insert({
      request_id: body.requestId,
      client_id: ctx.userId,
      worker_id: body.workerId,
      status: "new",
      price_cents: body.priceCents,
      eta_minutes: body.etaMinutes,
      commission_cents: commission,
    })
    .select("id")
    .single();
  if (error || !ord) {
    return NextResponse.json({ error: "Buyurtma yaratilmadi" }, { status: 500 });
  }
  await sb
    .from("requests")
    .update({ status: "matched", updated_at: new Date().toISOString() })
    .eq("id", body.requestId);
  await appendOrderEvent(ord.id as string, "created", {});
  return NextResponse.json({ orderId: ord.id, commission_cents: commission });
}

export async function GET() {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const sb = getServiceSupabase();
  if (ctx.role === "client") {
    const { data } = await sb
      .from("orders")
      .select("*, requests(summary, category)")
      .eq("client_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    return NextResponse.json({ orders: data ?? [] });
  }
  if (ctx.role === "worker") {
    const { data } = await sb
      .from("orders")
      .select("*, requests(summary, category, address)")
      .eq("worker_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    return NextResponse.json({ orders: data ?? [] });
  }
  const { data } = await sb
    .from("orders")
    .select("*, requests(summary)")
    .order("created_at", { ascending: false })
    .limit(100);
  return NextResponse.json({ orders: data ?? [] });
}
