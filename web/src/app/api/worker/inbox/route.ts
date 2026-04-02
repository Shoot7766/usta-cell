import { NextResponse } from "next/server";
import { requireSession, requireRole, loadWorkerProfile } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";

export async function GET() {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const denied = requireRole(ctx, ["worker"]);
  if (denied !== true) return denied;
  const sb = getServiceSupabase();
  const { data: orders } = await sb
    .from("orders")
    .select("id, status, price_cents, eta_minutes, created_at, requests ( summary, category, address )")
    .eq("worker_id", ctx.userId)
    .eq("status", "new")
    .order("created_at", { ascending: false })
    .limit(30);
  const wp = await loadWorkerProfile(ctx.userId);
  const services = (wp?.services as string[]) ?? [];
  const { data: openRequests } = await sb
    .from("requests")
    .select("id, summary, category, urgency, created_at, client_lat, client_lng")
    .eq("status", "submitted")
    .order("created_at", { ascending: false })
    .limit(40);
  const filtered =
    openRequests?.filter((r: { category?: string | null }) => {
      const c = r.category || "";
      if (!c || !services.length) return true;
      return services.some((s) =>
        s.toLowerCase().includes(c.slice(0, 5).toLowerCase())
      );
    }) ?? [];
  return NextResponse.json({ newOrders: orders ?? [], openRequests: filtered });
}
