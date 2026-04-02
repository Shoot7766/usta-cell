import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireRole } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { sanitizeText } from "@/lib/sanitize";

const Params = z.object({ id: z.string().uuid() });
const Body = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().max(500).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const denied = requireRole(ctx, ["client"]);
  if (denied !== true) return denied;
  const { id } = Params.parse(params);
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Noto'g'ri" }, { status: 400 });
  }
  const sb = getServiceSupabase();
  const { data: r } = await sb
    .from("requests")
    .select("client_id")
    .eq("id", id)
    .maybeSingle();
  if (!r || r.client_id !== ctx.userId) {
    return NextResponse.json({ error: "Topilmadi" }, { status: 404 });
  }
  await sb
    .from("requests")
    .update({
      client_lat: body.lat,
      client_lng: body.lng,
      address: body.address ? sanitizeText(body.address, 500) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  return NextResponse.json({ ok: true });
}
