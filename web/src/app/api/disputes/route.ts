import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { sanitizeText } from "@/lib/sanitize";

const Body = z.object({
  orderId: z.string().uuid(),
  reason: z.string().min(10).max(2000),
});

export async function POST(req: NextRequest) {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Noto'g'ri" }, { status: 400 });
  }
  const sb = getServiceSupabase();
  const { data: o } = await sb
    .from("orders")
    .select("id, client_id, worker_id")
    .eq("id", body.orderId)
    .maybeSingle();
  if (!o) return NextResponse.json({ error: "Topilmadi" }, { status: 404 });
  const part =
    o.client_id === ctx.userId ||
    o.worker_id === ctx.userId ||
    ctx.role === "admin";
  if (!part) return NextResponse.json({ error: "Ruxsat yo'q" }, { status: 403 });
  const { data: ins } = await sb
    .from("disputes")
    .insert({
      order_id: body.orderId,
      opened_by: ctx.userId,
      reason: sanitizeText(body.reason, 2000),
    })
    .select("id")
    .single();
  return NextResponse.json({ ok: true, disputeId: ins?.id });
}

export async function GET() {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Ruxsat yo'q" }, { status: 403 });
  }
  const sb = getServiceSupabase();
  const { data } = await sb
    .from("disputes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  return NextResponse.json({ disputes: data ?? [] });
}
