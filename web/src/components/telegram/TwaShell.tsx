"use client";

import { useEffect } from "react";
import { loadWebApp } from "@/lib/twa";

export function TwaShell() {
  useEffect(() => {
    let cancelled = false;
    void loadWebApp().then((WebApp) => {
      if (cancelled) return;
      try {
        // Inform Telegram that the app is ready
        WebApp.ready();
        
        // Expand the app to full height
        WebApp.expand();
        
        // Prevent accidental closing on swipe down
        WebApp.enableClosingConfirmation();
        
        // Initial theme setup (sync variables)
        syncTheme(WebApp);
        
        // Listen for theme changes
        WebApp.onEvent("themeChanged", () => syncTheme(WebApp));
      } catch (e) {
        console.error("Telegram SDK initialization failed", e);
      }
    });
    
    return () => {
      cancelled = true;
    };
  }, []);
  
  return null;
}

function syncTheme(WebApp: typeof import("@twa-dev/sdk").default) {
  const bg = WebApp.themeParams.bg_color || "#070a12";
  const text = WebApp.themeParams.text_color || "#e8f0ff";
  const hint = WebApp.themeParams.hint_color || "rgba(232, 240, 255, 0.5)";
  const link = WebApp.themeParams.link_color || "#22d3ee";
  const button = WebApp.themeParams.button_color || "#22d3ee";
  const buttonText = WebApp.themeParams.button_text_color || "#070a12";

  const root = document.documentElement;
  root.style.setProperty("--tg-bg-color", bg);
  root.style.setProperty("--tg-text-color", text);
  root.style.setProperty("--tg-hint-color", hint);
  root.style.setProperty("--tg-link-color", link);
  root.style.setProperty("--tg-button-color", button);
  root.style.setProperty("--tg-button-text-color", buttonText);
  
  // Set header and background color for the Mini App container
  WebApp.setHeaderColor(bg);
  WebApp.setBackgroundColor(bg);
}
