import { NextResponse } from "next/server";
import { requireSession, loadUserProfile, loadWorkerProfile, workerProfileComplete } from "@/lib/api-auth";
import { normalizePortfolioFromDb } from "@/lib/portfolio";
import { FREE_ORDER_ACCEPTS } from "@/lib/constants";

export async function GET() {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const u = await loadUserProfile(ctx.userId);
  if (!u) return NextResponse.json({ error: "Foydalanuvchi yo'q" }, { status: 404 });
  let worker = null as Record<string, unknown> | null;
  if (u.role === "worker") {
    worker = (await loadWorkerProfile(ctx.userId)) as Record<string, unknown> | null;
  }
  const base = {
    user: {
      id: u.id,
      role: u.role,
      profileCompleted: u.profile_completed,
      pendingRole: u.pending_role,
      displayName: u.display_name,
      firstName: u.first_name,
      lastName: u.last_name,
      phone: u.phone,
      walletBalanceCents: u.wallet_balance_cents ?? 0,
      onboardingStep: u.onboarding_step,
      workerProfileOk: u.role === "worker" ? workerProfileComplete(worker) : true,
    },
  };
  if (u.role !== "worker") {
    return NextResponse.json(base);
  }
  const wp = worker as Record<string, unknown> | null;
  const portfolioDb = normalizePortfolioFromDb(wp?.portfolio);
  return NextResponse.json({
    ...base,
    workerEarningsCents: wp ? Number(wp.earnings_balance_cents ?? 0) : 0,
    workerLeadsBalanceCents: wp ? Number(wp.leads_balance_cents ?? 0) : 0,
    workerFreeAcceptsRemaining: wp
      ? Math.max(0, Number(wp.free_order_accepts_remaining ?? FREE_ORDER_ACCEPTS))
      : 0,
    workerProfile: wp
      ? {
          services: (wp.services as string[]) ?? [],
          lat: wp.lat as number | null,
          lng: wp.lng as number | null,
          priceMinCents: Number(wp.price_min_cents ?? 0),
          priceMaxCents: Number(wp.price_max_cents ?? 0),
          bio: (wp.bio as string | null) ?? null,
          cityName: (wp.city_name as string | null) ?? null,
          portfolio: portfolioDb.map((p) => ({
            imageUrl: p.image_url,
            caption: p.caption ?? undefined,
          })),
        }
      : null,
  });
}
