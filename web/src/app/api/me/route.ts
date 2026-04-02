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
  return NextResponse.json({
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
  });
}
