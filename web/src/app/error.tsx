"use client";

import { useEffect } from "react";
import { loadWebApp } from "@/lib/twa";
import { useI18n } from "@/lib/i18n";
import { hapticError } from "@/lib/haptic";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    hapticError();
    void loadWebApp().then((WebApp) => {
      WebApp.showAlert(error.message || "Xatolik yuz berdi");
    });
    
    void fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: "error",
        message: error.message || "boundary_error",
        stack: error.stack,
        digest: error.digest,
        url: typeof window !== "undefined" ? window.location.href : "",
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-[#070a12] px-6 text-[#e8f0ff]">
      <p className="text-sm text-red-300/90 text-center mb-2">
        {error.message || t("auth_failed")}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-2 rounded-2xl bg-gradient-to-r from-cyan-400/90 to-fuchsia-500/90 px-6 py-3 text-sm font-semibold text-slate-950"
      >
        {t("retry")}
      </button>
    </div>
  );
}
