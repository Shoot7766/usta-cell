import { NextResponse } from "next/server";
import { requireSession, requireRole } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { fetchAdminStats } from "@/lib/admin-stats";

export async function GET() {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const denied = requireRole(ctx, ["admin"]);
  if (denied !== true) return denied;
  const sb = getServiceSupabase();
  const stats = await fetchAdminStats(sb);
  return NextResponse.json({ stats });
}
