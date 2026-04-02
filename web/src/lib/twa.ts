/** Telegram WebApp SDK — faqat clientda dynamic import (SSR da window xatosi bo‘lmasin) */
export function loadWebApp() {
  return import("@twa-dev/sdk").then((m) => m.default);
}
