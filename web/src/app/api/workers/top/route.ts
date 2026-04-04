import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { normalizePortfolioFromDb, portfolioPreview } from "@/lib/portfolio";
import { isDemoTelegramId } from "@/lib/demo-workers";

export const runtime = "nodejs";

function rankScore(ratingAvg: number, ratingCount: number, completedOrders: number): number {
  const r = Math.max(0, Math.min(5, ratingAvg));
  const n = Math.max(0, ratingCount);
  const c = Math.max(0, completedOrders);
  const bayesian = (r * n + 4.0 * 10) / (n + 10);
  const popularityBonus = Math.log2(n + 1) * 0.05;
  const ordersBonus = Math.log2(c + 1) * 0.03;
  return bayesian + popularityBonus + ordersBonus;
}

export async function GET(req: NextRequest) {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;

  const { searchParams } = new URL(req.url);
  const category = (searchParams.get("category") || "").trim().toLowerCase();
  const q = (searchParams.get("q") || "").trim().toLowerCase();

  const sb = getServiceSupabase();

  const { data: profiles } = await sb
    .from("worker_profiles")
    .select(
      "user_id, services, city_name, bio, rating_avg, rating_count, is_available, price_min_cents, price_max_cents, subscription_tier, portfolio"
    );

  if (!profiles?.length) return NextResponse.json({ workers: [] });

  const ids = profiles.map((p: { user_id: string }) => p.user_id);

  const [usersResult, ordersResult] = await Promise.all([
    sb
      .from("users")
      .select("id, display_name, telegram_id")
      .in("id", ids),
    sb
      .from("orders")
      .select("worker_id")
      .eq("status", "completed")
      .in("worker_id", ids),
  ]);

  const users = usersResult.data ?? [];
  const completedMap = new Map<string, number>();
  for (const o of ordersResult.data ?? []) {
    const k = o.worker_id as string;
    completedMap.set(k, (completedMap.get(k) ?? 0) + 1);
  }

  const nameMap = new Map(
    users.map((u: { id: string; display_name: string | null }) => [u.id, u.display_name])
  );
  const tgMap = new Map(
    users.map((u: { id: string; telegram_id: unknown }) => [u.id, u.telegram_id])
  );

  type Row = {
    user_id: string;
    display_name: string | null;
    services: string[];
    city_name: string | null;
    bio: string | null;
    rating_avg: number;
    rating_count: number;
    is_available: boolean;
    price_min_cents: number;
    price_max_cents: number;
    subscription_tier: string;
    completed_orders: number;
    score: number;
    badges: string[];
    portfolio_preview: { image_url: string; caption?: string | null }[];
  };

  const rows: Row[] = [];
  for (const p of profiles) {
    const uid = p.user_id as string;
    if (!nameMap.has(uid)) continue;
    if (isDemoTelegramId(tgMap.get(uid))) continue;

    const services = (p.services as string[]) ?? [];
    const ratingAvg = Number(p.rating_avg ?? 0);
    const ratingCount = Number(p.rating_count ?? 0);
    const completedOrders = completedMap.get(uid) ?? 0;
    const score = rankScore(ratingAvg, ratingCount, completedOrders);

    const badges: string[] = [];
    if (ratingAvg >= 4.8 && ratingCount >= 5) badges.push("top_worker");
    if (p.subscription_tier === "pro") badges.push("pro");
    if (completedOrders >= 10) badges.push("experienced");

    const displayName = nameMap.get(uid) ?? null;

    // filter by category
    if (category) {
      const match = services.some((s) => s.toLowerCase().includes(category));
      if (!match) continue;
    }

    // filter by search query
    if (q) {
      const hay = [
        displayName ?? "",
        ...(services),
        p.city_name ?? "",
        p.bio ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) continue;
    }

    rows.push({
      user_id: uid,
      display_name: displayName,
      services,
      city_name: (p.city_name as string | null) ?? null,
      bio: (p.bio as string | null) ?? null,
      rating_avg: ratingAvg,
      rating_count: ratingCount,
      is_available: Boolean(p.is_available),
      price_min_cents: Number(p.price_min_cents ?? 0),
      price_max_cents: Number(p.price_max_cents ?? 0),
      subscription_tier: (p.subscription_tier as string) ?? "free",
      completed_orders: completedOrders,
      score,
      badges,
      portfolio_preview: portfolioPreview(normalizePortfolioFromDb(p.portfolio)),
    });
  }

  rows.sort((a, b) => b.score - a.score);
  const top100 = rows.slice(0, 100);

  return NextResponse.json({ workers: top100 });
}
