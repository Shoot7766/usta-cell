import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireRole } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { sanitizeText } from "@/lib/sanitize";

const Body = z.object({
  orderId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1200).optional(),
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
  const { data: o } = await sb
    .from("orders")
    .select("id, client_id, worker_id, status")
    .eq("id", body.orderId)
    .maybeSingle();
  if (!o || o.client_id !== ctx.userId) {
    return NextResponse.json({ error: "Buyurtma topilmadi" }, { status: 404 });
  }
  if (o.status !== "completed") {
    return NextResponse.json({ error: "Faqat yakunlangan buyurtma" }, { status: 400 });
  }
  const { data: ex } = await sb
    .from("reviews")
    .select("id")
    .eq("order_id", body.orderId)
    .maybeSingle();
  if (ex) {
    return NextResponse.json({ error: "Allaqachon baholangan" }, { status: 400 });
  }
  await sb.from("reviews").insert({
    order_id: body.orderId,
    reviewer_id: ctx.userId,
    worker_id: o.worker_id as string,
    rating: body.rating,
    comment: body.comment ? sanitizeText(body.comment, 1200) : null,
  });
  const { data: wp } = await sb
    .from("worker_profiles")
    .select("rating_avg, rating_count")
    .eq("user_id", o.worker_id as string)
    .maybeSingle();
  const cnt = ((wp?.rating_count as number) ?? 0) + 1;
  const avg = Number(wp?.rating_avg) || 4.5;
  const nextAvg = (avg * (cnt - 1) + body.rating) / cnt;
  await sb
    .from("worker_profiles")
    .update({ rating_avg: nextAvg, rating_count: cnt })
    .eq("user_id", o.worker_id as string);
  return NextResponse.json({ ok: true });
}
