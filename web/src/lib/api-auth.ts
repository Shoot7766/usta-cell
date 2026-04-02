import { cookies } from "next/headers";
import { getServiceSupabase } from "./supabase/admin";
import { SESSION_COOKIE_NAME, verifySession } from "./session";
import type { Role } from "./types";

export type AuthedContext = {
  userId: string;
  telegramId: string;
  role: Role;
};

export async function requireSession(): Promise<AuthedContext | Response> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  const s = await verifySession(token);
  if (!s) {
    return Response.json({ error: "Kirish rad etildi" }, { status: 401 });
  }
  return s;
}

export function requireRole(ctx: AuthedContext, roles: Role[]): true | Response {
  if (!roles.includes(ctx.role)) {
    return Response.json({ error: "Ruxsat yo'q" }, { status: 403 });
  }
  return true;
}

export async function loadUserProfile(userId: string) {
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("users")
    .select(
      "id, role, profile_completed, pending_role, display_name, phone, onboarding_step, wallet_balance_cents"
    )
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as {
    id: string;
    role: Role;
    profile_completed: boolean;
    pending_role: Role | null;
    display_name: string | null;
    phone: string | null;
    onboarding_step: string;
    wallet_balance_cents: number;
  };
}

export async function loadWorkerProfile(userId: string) {
  const sb = getServiceSupabase();
  const { data } = await sb
    .from("worker_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

export function workerProfileComplete(
  row: Record<string, unknown> | null
): boolean {
  if (!row) return false;
  const services = row.services as string[] | undefined;
  const lat = row.lat as number | null | undefined;
  const lng = row.lng as number | null | undefined;
  const pm = row.price_min_cents as number | undefined;
  const px = row.price_max_cents as number | undefined;
  if (!services?.length) return false;
  if (lat == null || lng == null) return false;
  if (pm == null || px == null || px < pm) return false;
  return true;
}
