import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireRole } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

  const patch: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.label === "string") patch.label = body.label.trim() || null;
  if (typeof body.identifier === "string" && body.identifier.trim())
    patch.identifier = body.identifier.trim();

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Hech narsa o'zgartirilmadi" }, { status: 400 });
  }

  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("import_sources")
    .update(patch)
    .eq("id", params.id)
    .select("id, type, identifier, label, enabled")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ source: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const denied = requireRole(ctx, ["admin"]);
  if (denied !== true) return denied;

  const sb = getServiceSupabase();
  const { error } = await sb
    .from("import_sources")
    .delete()
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
