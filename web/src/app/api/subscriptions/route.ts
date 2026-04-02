import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireRole } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { PRO_SUBSCRIPTION_CENTS_MONTH } from "@/lib/constants";

const Body = z.object({
  tier: z.enum(["free", "pro"]),
});

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
  const sb = getServiceSupabase();
  if (body.tier === "free") {
    await sb
      .from("subscriptions")
      .upsert(
        {
          user_id: ctx.userId,
          tier: "free",
          active: true,
          renews_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    await sb
      .from("worker_profiles")
      .update({ subscription_tier: "free" })
      .eq("user_id", ctx.userId);
    return NextResponse.json({ ok: true, tier: "free" });
  }
  const renews = new Date();
  renews.setMonth(renews.getMonth() + 1);
  await sb.from("transactions").insert({
    user_id: ctx.userId,
    type: "subscription",
    amount_cents: -PRO_SUBSCRIPTION_CENTS_MONTH,
    meta: { tier: "pro", period: "month" },
  });
  await sb
    .from("subscriptions")
    .upsert(
      {
        user_id: ctx.userId,
        tier: "pro",
        active: true,
        renews_at: renews.toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  await sb
    .from("worker_profiles")
    .update({ subscription_tier: "pro" })
    .eq("user_id", ctx.userId);
  return NextResponse.json({ ok: true, tier: "pro", renews_at: renews.toISOString() });
}
