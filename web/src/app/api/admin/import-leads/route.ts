import { NextResponse } from "next/server";
import { requireSession, requireRole } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";

export async function GET() {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const denied = requireRole(ctx, ["admin"]);
  if (denied !== true) return denied;

  const sb = getServiceSupabase();

  const [reqResult, wpResult] = await Promise.all([
    sb
      .from("requests")
      .select(
        "id, summary, category, source_provider, source_label, source_url, external_contact_name, external_contact_phone, external_contact_handle, created_at, status"
      )
      .eq("imported_from_external", true)
      .order("created_at", { ascending: false })
      .limit(60),
    sb
      .from("worker_profiles")
      .select(
        "user_id, source, source_url, external_phone, external_handle, city_name, services, created_at, users(display_name, phone)"
      )
      .neq("source", "app")
      .order("created_at", { ascending: false })
      .limit(60),
  ]);

  const requests = (reqResult.data ?? []).map((r) => ({
    kind: "client_request" as const,
    id: r.id as string,
    summary: r.summary as string | null,
    category: r.category as string | null,
    phone: r.external_contact_phone as string | null,
    name: r.external_contact_name as string | null,
    handle: r.external_contact_handle as string | null,
    source: (r.source_label ?? r.source_provider) as string | null,
    source_url: r.source_url as string | null,
    status: r.status as string,
    created_at: r.created_at as string,
  }));

  const workers = (wpResult.data ?? []).map((w) => {
    const user = w.users as { display_name?: string | null; phone?: string | null } | null;
    return {
      kind: "worker_offer" as const,
      id: w.user_id as string,
      summary: ((w.services as string[]) ?? []).join(", ") || null,
      category: ((w.services as string[]) ?? [])[0] ?? null,
      phone: (w.external_phone ?? user?.phone) as string | null,
      name: user?.display_name as string | null,
      handle: w.external_handle as string | null,
      source: w.source as string | null,
      source_url: w.source_url as string | null,
      status: "profile",
      city: w.city_name as string | null,
      created_at: w.created_at as string,
    };
  });

  const combined = [...requests, ...workers].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return NextResponse.json({ leads: combined });
}
