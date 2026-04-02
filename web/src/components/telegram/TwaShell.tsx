"use client";

import { useEffect } from "react";
import { loadWebApp } from "@/lib/twa";

export function TwaShell() {
  useEffect(() => {
    let cancelled = false;
    void loadWebApp().then((WebApp) => {
      if (cancelled) return;
      try {
        WebApp.ready();
        WebApp.expand();
        WebApp.enableClosingConfirmation();
        const bg = WebApp.themeParams.bg_color || "#070a12";
        document.documentElement.style.setProperty("--tg-bg", bg);
      } catch {
        /* not inside Telegram */
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
