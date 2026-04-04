import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireRole } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";

export async function GET() {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const denied = requireRole(ctx, ["admin"]);
  if (denied !== true) return denied;

  const sb = getServiceSupabase();
  const { data } = await sb
    .from("import_sources")
    .select("id, type, identifier, label, enabled, created_at")
    .order("created_at", { ascending: false });

  return NextResponse.json({ sources: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const denied = requireRole(ctx, ["admin"]);
  if (denied !== true) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON noto'g'ri" }, { status: 400 });
  }

  const type = typeof body.type === "string" ? body.type.trim() : "";
  const identifier = typeof body.identifier === "string" ? body.identifier.trim() : "";
  const label = typeof body.label === "string" ? body.label.trim() || null : null;

  if (!["telegram_channel", "website", "custom"].includes(type) || !identifier) {
    return NextResponse.json(
      { error: "type (telegram_channel|website|custom) va identifier kerak" },
      { status: 400 }
    );
  }

  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("import_sources")
    .insert({ type, identifier, label, enabled: true })
    .select("id, type, identifier, label, enabled, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ source: data });
}
