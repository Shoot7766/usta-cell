import { apiJson } from "@/lib/api-client";

/** BootClient keyin /onboarding ga yo‘naltirish (rolni qayta tanlash). */
export const FORCE_ONBOARDING_AFTER_LOGOUT = "usta_force_onboarding";

export async function logoutToRolePicker(): Promise<void> {
  await apiJson("/api/auth/logout", { method: "POST" });
  if (typeof window !== "undefined") {
    sessionStorage.setItem(FORCE_ONBOARDING_AFTER_LOGOUT, "1");
    window.location.assign("/");
  }
}
