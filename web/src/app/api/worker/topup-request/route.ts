import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireRole } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";

const Body = z.object({
  amountCents: z.number().int().min(30_000).max(50_000_000),
  receiptUrl: z.string().url().max(2048),
});

/** Usta to‘ldirish so‘rovi — admin tasdig‘idan keyin balansga qo‘shiladi. */
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
  const rl = rateLimit(`topupreq:${ctx.userId}`, 15, 86_400_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Kunlik so'rovlar chegarasi" }, { status: 429 });
  }
  const sb = getServiceSupabase();
  const { data: row, error } = await sb
    .from("worker_topup_requests")
    .insert({
      worker_id: ctx.userId,
      amount_cents: body.amountCents,
      receipt_url: body.receiptUrl,
      status: "pending",
    })
    .select("id, amount_cents, created_at")
    .single();
  if (error || !row) {
    return NextResponse.json(
      { error: "So'rov yaratilmadi. Migratsiya qo‘llanganini tekshiring." },
      { status: 500 }
    );
  }
  return NextResponse.json({
    ok: true,
    request: row,
  });
}
