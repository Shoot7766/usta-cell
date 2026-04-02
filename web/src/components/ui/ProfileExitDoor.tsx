"use client";

import { logoutToRolePicker } from "@/lib/auth-client";

/** Chap yuqori burchak — profildan chiqish (onboarding / rol tanlash). */
export function ProfileExitDoor({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      title="Profildan chiqish"
      aria-label="Profildan chiqish"
      className={`rounded-xl border border-white/15 bg-white/5 p-2 text-white/80 hover:bg-white/10 hover:text-white transition-colors ${className}`}
      onClick={() => void logoutToRolePicker()}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M10 7V5a2 2 0 012-2h7a2 2 0 012 2v14a2 2 0 01-2 2h-7a2 2 0 01-2-2v-2M15 12H3m0 0l3-3m-3 3l3 3"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
