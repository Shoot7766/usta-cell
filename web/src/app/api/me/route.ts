import { NextResponse } from "next/server";
import { requireSession, loadUserProfile, loadWorkerProfile, workerProfileComplete } from "@/lib/api-auth";

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
      phone: u.phone,
      onboardingStep: u.onboarding_step,
      workerProfileOk: u.role === "worker" ? workerProfileComplete(worker) : true,
    },
  };
  if (u.role !== "worker") {
    return NextResponse.json(base);
  }
  const wp = worker as Record<string, unknown> | null;
  return NextResponse.json({
    ...base,
    workerProfile: wp
      ? {
          services: (wp.services as string[]) ?? [],
          lat: wp.lat as number | null,
          lng: wp.lng as number | null,
          priceMinCents: Number(wp.price_min_cents ?? 0),
          priceMaxCents: Number(wp.price_max_cents ?? 0),
          bio: (wp.bio as string | null) ?? null,
          cityName: (wp.city_name as string | null) ?? null,
        }
      : null,
  });
}
