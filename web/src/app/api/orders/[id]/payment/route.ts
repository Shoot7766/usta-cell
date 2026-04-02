import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireRole } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { appendOrderEvent } from "@/lib/order-lifecycle";

const Params = z.object({ id: z.string().uuid() });

const Body = z.object({
  paymentMethod: z.enum(["cash", "card", "transfer", "other"]).optional(),
  paymentStatus: z.enum(["pending", "confirmed"]).optional(),
});

export async function PATCH(
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
  if (body.paymentMethod == null && body.paymentStatus == null) {
    return NextResponse.json({ error: "Hech narsa yangilanmadi" }, { status: 400 });
  }
  const sb = getServiceSupabase();
  const { data: o } = await sb
    .from("orders")
    .select("id, client_id, worker_id, status, payment_method, payment_status")
    .eq("id", id)
    .maybeSingle();
  if (!o) {
    return NextResponse.json({ error: "Topilmadi" }, { status: 404 });
  }
  const isClient = o.client_id === ctx.userId;
  const isWorker = o.worker_id === ctx.userId;
  if (!isClient && !isWorker && ctx.role !== "admin") {
    return NextResponse.json({ error: "Ruxsat yo'q" }, { status: 403 });
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.paymentMethod != null) {
    if (!isClient && ctx.role !== "admin") {
      return NextResponse.json(
        { error: "To‘lov usulini faqat mijoz o‘zgartiradi" },
        { status: 403 }
      );
    }
    if (o.status === "canceled" || o.status === "completed") {
      return NextResponse.json({ error: "Buyurtma yopilgan" }, { status: 400 });
    }
    patch.payment_method = body.paymentMethod;
  }
  if (body.paymentStatus != null) {
    if (body.paymentStatus === "confirmed") {
      const denied = requireRole(ctx, ["worker", "admin"]);
      if (denied !== true) return denied;
      if (ctx.role !== "admin" && o.worker_id !== ctx.userId) {
        return NextResponse.json(
          { error: "Bu buyurtma uchun tasdiqlash huquqingiz yo‘q" },
          { status: 403 }
        );
      }
      if (!["accepted", "in_progress"].includes(o.status as string)) {
        return NextResponse.json(
          { error: "Bu holatda tasdiqlab bo‘lmaydi" },
          { status: 400 }
        );
      }
    }
    if (body.paymentStatus === "pending" && ctx.role !== "admin") {
      return NextResponse.json({ error: "Kutilish holatini faqat admin qaytaradi" }, { status: 403 });
    }
    patch.payment_status = body.paymentStatus;
  }
  await sb.from("orders").update(patch).eq("id", id);
  await appendOrderEvent(id, "payment_updated", {
    ...body,
    by: ctx.role,
  });
  const { data: fresh } = await sb
    .from("orders")
    .select("payment_method, payment_status, price_cents")
    .eq("id", id)
    .single();
  return NextResponse.json({ ok: true, order: fresh });
}
