import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { applyNoShowIfNeeded } from "@/lib/order-lifecycle";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Rad etildi" }, { status: 401 });
  }
  const sb = getServiceSupabase();
  const { data: rows } = await sb
    .from("orders")
    .select("id")
    .eq("status", "accepted")
    .lt("arrived_deadline_at", new Date().toISOString());
  let n = 0;
  for (const r of rows ?? []) {
    const hit = await applyNoShowIfNeeded(r.id as string);
    if (hit) n += 1;
  }
  return NextResponse.json({ processed: n });
}
