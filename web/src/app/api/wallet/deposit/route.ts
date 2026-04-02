import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireRole, loadUserProfile } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";

const Body = z.object({
  amountCents: z.number().int().min(10_000).max(50_000_000),
});

/** Demo / ichki to‘ldirish (keyin to‘lov provayderi ulanadi). */
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
  const day = rateLimit(`walletdep:${ctx.userId}`, 25, 86_400_000);
  if (!day.ok) {
    return NextResponse.json({ error: "Kunlik limit" }, { status: 429 });
  }
  const u = await loadUserProfile(ctx.userId);
  if (!u) {
    return NextResponse.json({ error: "Foydalanuvchi yo'q" }, { status: 404 });
  }
  const sb = getServiceSupabase();
  const next = (u.wallet_balance_cents ?? 0) + body.amountCents;
  await sb
    .from("users")
    .update({
      wallet_balance_cents: next,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ctx.userId);
  await sb.from("transactions").insert({
    user_id: ctx.userId,
    order_id: null,
    type: "adjustment",
    amount_cents: body.amountCents,
    meta: { note: "Hamyon to'ldirish (demo)" },
  });
  return NextResponse.json({ ok: true, walletBalanceCents: next });
}
