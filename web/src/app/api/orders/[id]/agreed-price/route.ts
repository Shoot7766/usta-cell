import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireRole } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { appendOrderEvent, computeCommission } from "@/lib/order-lifecycle";

const Params = z.object({ id: z.string().uuid() });

const PatchBody = z.object({
  priceCents: z.number().int().min(1).max(500_000_000),
});

/** Mijoz telefonda kelishgan narxni kiritadi (yangi / qabul qilingan buyurtma). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const denied = requireRole(ctx, ["client"]);
  if (denied !== true) return denied;
  const { id } = Params.parse(params);
  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Noto'g'ri" }, { status: 400 });
  }
  const sb = getServiceSupabase();
  const { data: o } = await sb
    .from("orders")
    .select("id, client_id, status, price_cents")
    .eq("id", id)
    .maybeSingle();
  if (!o || o.client_id !== ctx.userId) {
    return NextResponse.json({ error: "Topilmadi" }, { status: 404 });
  }
  if (!["new", "accepted"].includes(o.status as string)) {
    return NextResponse.json(
      { error: "Narxni faqat yangi yoki qabul qilingan bosqichda o‘zgartirish mumkin" },
      { status: 400 }
    );
  }
  const commission = computeCommission(body.priceCents);
  await sb
    .from("orders")
    .update({
      price_cents: body.priceCents,
      commission_cents: commission,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  await appendOrderEvent(id, "client_set_agreed_price", {
    price_cents: body.priceCents,
  });
  return NextResponse.json({ ok: true, price_cents: body.priceCents, commission_cents: commission });
}

const PostBody = z.object({ confirm: z.literal(true) });

/** Usta kelishilgan narxdan roziligini bildiradi (voqea jurnalida). */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const denied = requireRole(ctx, ["worker", "admin"]);
  if (denied !== true) return denied;
  const { id } = Params.parse(params);
  let body: z.infer<typeof PostBody>;
  try {
    body = PostBody.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Noto'g'ri" }, { status: 400 });
  }
  const sb = getServiceSupabase();
  const { data: o } = await sb
    .from("orders")
    .select("id, worker_id, status, price_cents")
    .eq("id", id)
    .maybeSingle();
  if (!o) {
    return NextResponse.json({ error: "Topilmadi" }, { status: 404 });
  }
  if (ctx.role !== "admin" && o.worker_id !== ctx.userId) {
    return NextResponse.json({ error: "Ruxsat yo'q" }, { status: 403 });
  }
  if (!["new", "accepted"].includes(o.status as string)) {
    return NextResponse.json({ error: "Bu bosqichda tasdiqlab bo‘lmaydi" }, { status: 400 });
  }
  if (!body.confirm) {
    return NextResponse.json({ error: "confirm: true kerak" }, { status: 400 });
  }
  await appendOrderEvent(id, "worker_confirmed_agreed_price", {
    price_cents: o.price_cents,
  });
  return NextResponse.json({ ok: true });
}
