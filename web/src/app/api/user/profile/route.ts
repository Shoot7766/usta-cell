import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, loadWorkerProfile, workerProfileComplete } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { sanitizeText, sanitizeStringArray } from "@/lib/sanitize";
import { normalizePortfolioFromDb } from "@/lib/portfolio";

const Body = z.object({
  displayName: z.string().min(2).max(120).optional(),
  phone: z.string().min(6).max(32).optional(),
  bio: z.string().max(800).optional(),
  services: z.array(z.string()).max(40).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  cityName: z.string().max(120).optional(),
  workingHours: z.record(z.string()).optional(),
  isAvailable: z.boolean().optional(),
  portfolio: z
    .array(
      z.object({
        imageUrl: z.string().url().max(2048),
        caption: z.string().max(240).optional(),
      })
    )
    .max(12)
    .optional(),
});

export async function PATCH(req: NextRequest) {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Noto'g'ri so'rov" }, { status: 400 });
  }
  const sb = getServiceSupabase();
  const userPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.displayName != null) userPatch.display_name = sanitizeText(body.displayName, 120);
  if (body.phone != null) userPatch.phone = sanitizeText(body.phone, 32);
  if (Object.keys(userPatch).length > 1) {
    await sb.from("users").update(userPatch).eq("id", ctx.userId);
  }
  if (ctx.role === "worker") {
    const wp: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.bio != null) wp.bio = sanitizeText(body.bio, 800);
    if (body.services != null) wp.services = sanitizeStringArray(body.services, 40);
    if (body.lat != null) wp.lat = body.lat;
    if (body.lng != null) wp.lng = body.lng;
    if (body.cityName != null) wp.city_name = sanitizeText(body.cityName, 120);
    if (body.workingHours != null) wp.working_hours = body.workingHours;
    if (body.isAvailable != null) wp.is_available = body.isAvailable;
    if (body.portfolio != null) {
      wp.portfolio = normalizePortfolioFromDb(
        body.portfolio.map((p) => ({
          imageUrl: p.imageUrl,
          caption: p.caption,
        }))
      );
    }
    if (Object.keys(wp).length > 1) {
      await sb.from("worker_profiles").upsert(
        {
          user_id: ctx.userId,
          ...wp,
          price_min_cents: 0,
          price_max_cents: 0,
        },
        { onConflict: "user_id" }
      );
    }
  }
  const { data: u } = await sb
    .from("users")
    .select("display_name, phone, role")
    .eq("id", ctx.userId)
    .single();
  const wRow = ctx.role === "worker" ? await loadWorkerProfile(ctx.userId) : null;
  const complete =
    ctx.role === "worker"
      ? Boolean(u?.display_name && u?.phone && workerProfileComplete(wRow as Record<string, unknown>))
      : Boolean(u?.display_name && u?.phone);
  await sb
    .from("users")
    .update({
      profile_completed: complete,
      onboarding_step: complete ? "done" : ctx.role === "worker" ? "worker_profile" : "client_profile",
    })
    .eq("id", ctx.userId);
  return NextResponse.json({ ok: true, profileCompleted: complete });
}
