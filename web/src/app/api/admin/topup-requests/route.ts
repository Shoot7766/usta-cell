import { NextResponse } from "next/server";
import { requireSession, requireRole } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";

export async function GET() {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const denied = requireRole(ctx, ["admin"]);
  if (denied !== true) return denied;
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("worker_topup_requests")
    .select("id, worker_id, amount_cents, status, created_at, resolved_at, receipt_url")
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const ids = Array.from(
    new Set((data ?? []).map((r: { worker_id: string }) => r.worker_id))
  );
  const names = new Map<string, string | null>();
  if (ids.length) {
    const { data: users } = await sb
      .from("users")
      .select("id, display_name, phone")
      .in("id", ids);
    for (const u of users ?? []) {
      names.set(
        u.id as string,
        [u.display_name, u.phone].filter(Boolean).join(" · ") || null
      );
    }
  }
  const rows = (data ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    worker_label: names.get(r.worker_id as string) ?? r.worker_id,
  }));
  return NextResponse.json({ requests: rows });
}
