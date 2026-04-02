"use client";

/** Admin bilan Telegram orqali bog‘lanish (@Salomov_2502). */
const ADMIN_TG = "https://t.me/Salomov_2502";

export function AdminTelegramFab() {
  return (
    <a
      href={ADMIN_TG}
      target="_blank"
      rel="noopener noreferrer"
      title="Admin bilan bog‘lanish"
      aria-label="Admin bilan bog‘lanish (Telegram)"
      className="fixed bottom-28 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-cyan-400/30 bg-[rgba(18,24,46,0.92)] shadow-glass backdrop-blur-md text-cyan-200 hover:text-white hover:border-cyan-300/50 transition-colors"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
        aria-hidden
      >
        <path d="M12 2a3 3 0 0 0-3 3v1H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3V5a3 3 0 0 0-3-3z" />
        <path d="M9 14h6M9 18h4" />
        <circle cx="12" cy="10" r="1" fill="currentColor" stroke="none" />
      </svg>
    </a>
  );
}
