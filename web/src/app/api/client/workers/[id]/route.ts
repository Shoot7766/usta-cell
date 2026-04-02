import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireRole } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { normalizePortfolioFromDb } from "@/lib/portfolio";

const Params = z.object({ id: z.string().uuid() });

/** Mijoz: usta ochiq profili (portfolio izohlari bilan). */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const denied = requireRole(ctx, ["client"]);
  if (denied !== true) return denied;
  const { id } = Params.parse(params);
  const sb = getServiceSupabase();
  const { data: u } = await sb
    .from("users")
    .select("id, display_name, role")
    .eq("id", id)
    .maybeSingle();
  if (!u || u.role !== "worker") {
    return NextResponse.json({ error: "Usta topilmadi" }, { status: 404 });
  }
  const { data: wp } = await sb
    .from("worker_profiles")
    .select("bio, city_name, services, portfolio, rating_avg, rating_count, is_available")
    .eq("user_id", id)
    .maybeSingle();
  if (!wp) {
    return NextResponse.json({ error: "Profil topilmadi" }, { status: 404 });
  }
  const portfolio = normalizePortfolioFromDb(wp.portfolio);
  return NextResponse.json({
    workerId: id,
    displayName: (u.display_name as string | null) ?? null,
    bio: (wp.bio as string | null) ?? null,
    cityName: (wp.city_name as string | null) ?? null,
    services: (wp.services as string[]) ?? [],
    ratingAvg: Number(wp.rating_avg ?? 0),
    ratingCount: Number(wp.rating_count ?? 0),
    isAvailable: Boolean(wp.is_available),
    portfolio: portfolio.map((p) => ({
      imageUrl: p.image_url,
      caption: p.caption ?? undefined,
    })),
  });
}
