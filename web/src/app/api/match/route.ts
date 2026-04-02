import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireRole } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { attachDistance, scoreWorkers } from "@/lib/matching";
import {
  buildRequestServiceBlob,
  workerMatchesServiceBlob,
  requestEligibleForMatchFlow,
} from "@/lib/service-match";

const Q = z.object({ requestId: z.string().uuid() });

export async function GET(req: NextRequest) {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const denied = requireRole(ctx, ["client"]);
  if (denied !== true) return denied;
  const { searchParams } = new URL(req.url);
  const q = Q.safeParse({ requestId: searchParams.get("requestId") });
  if (!q.success) {
    return NextResponse.json({ error: "requestId kerak" }, { status: 400 });
  }
  const sb = getServiceSupabase();
  const { data: r } = await sb
    .from("requests")
    .select("*")
    .eq("id", q.data.requestId)
    .maybeSingle();
  if (!r || r.client_id !== ctx.userId) {
    return NextResponse.json({ error: "So'rov topilmadi" }, { status: 404 });
  }
  if (!requestEligibleForMatchFlow(r as { status: string; summary?: string | null; category?: string | null })) {
    return NextResponse.json(
      { error: "Avval chatda muammoni qisqacha yozing (AI xulosa bersin)" },
      { status: 400 }
    );
  }
  const { data: profiles } = await sb
    .from("worker_profiles")
    .select("*")
    .eq("is_available", true);
  const ids = (profiles ?? []).map((p: { user_id: string }) => p.user_id);
  if (!ids.length) {
    return NextResponse.json({ workers: [] });
  }
  const { data: users } = await sb
    .from("users")
    .select("id, display_name, role")
    .in("id", ids)
    .eq("role", "worker");
  const names = new Map(
    (users ?? []).map((u: { id: string; display_name: string | null }) => [
      u.id,
      u.display_name,
    ])
  );
  const rows =
    profiles?.map((w: Record<string, unknown>) => ({
      user_id: w.user_id as string,
      display_name: names.get(w.user_id as string) ?? null,
      bio: (w.bio as string | null) ?? null,
      services: (w.services as string[]) ?? [],
      lat: (w.lat as number | null) ?? null,
      lng: (w.lng as number | null) ?? null,
      price_min_cents: w.price_min_cents as number,
      price_max_cents: w.price_max_cents as number,
      is_available: Boolean(w.is_available),
      avg_response_seconds: w.avg_response_seconds as number,
      rating_avg: Number(w.rating_avg),
      rating_count: w.rating_count as number,
      subscription_tier: w.subscription_tier as "free" | "pro",
    })) ?? [];

  const blob = buildRequestServiceBlob({
    category: r.category as string | null,
    summary: r.summary as string | null,
    tags: r.tags as string[] | null,
    structured: r.structured,
  });
  const filtered = rows.filter((w) => workerMatchesServiceBlob(w.services, blob));
  const list = filtered.length ? filtered : rows;
  const withDist = attachDistance(
    list,
    r.client_lat as number | null,
    r.client_lng as number | null
  );
  const scored = scoreWorkers(withDist, {
    requestMinCents: r.price_min_cents as number | null,
    requestMaxCents: r.price_max_cents as number | null,
  });
  return NextResponse.json({ workers: scored });
}
