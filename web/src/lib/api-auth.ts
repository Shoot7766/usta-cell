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

export type LoadedUserProfile = {
  id: string;
  role: Role;
  profile_completed: boolean;
  pending_role: Role | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  onboarding_step: string;
  wallet_balance_cents: number;
};

const USERS_SELECT_WITH_WALLET =
  "id, role, profile_completed, pending_role, display_name, first_name, last_name, phone, onboarding_step, wallet_balance_cents";
const USERS_SELECT_BASE =
  "id, role, profile_completed, pending_role, display_name, first_name, last_name, phone, onboarding_step";

/**
 * wallet_balance_cents migratsiyasi hali qo‘llanmagan DB uchun: birinchi so‘rov xato bersa,
 * asosiy ustunlar bilan qayta urinadi (balans 0 deb qabul qilinadi).
 */
export async function loadUserProfile(userId: string): Promise<LoadedUserProfile | null> {
  const sb = getServiceSupabase();
  const first = await sb
    .from("users")
    .select(USERS_SELECT_WITH_WALLET)
    .eq("id", userId)
    .maybeSingle();
  if (!first.error && first.data) {
    return first.data as LoadedUserProfile;
  }
  if (first.error) {
    const second = await sb
      .from("users")
      .select(USERS_SELECT_BASE)
      .eq("id", userId)
      .maybeSingle();
    if (second.error || !second.data) return null;
    const row = second.data as Omit<LoadedUserProfile, "wallet_balance_cents">;
    return {
      ...row,
      first_name: row.first_name ?? null,
      last_name: row.last_name ?? null,
      wallet_balance_cents: 0,
    };
  }
  return null;
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
  if (!services?.length) return false;
  if (lat == null || lng == null) return false;
  return true;
}
