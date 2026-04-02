import { loadWebApp } from "./twa";

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/**
 * Avval Telegram LocationManager (8.0+), keyin brauzer geolocation.
 */
export async function getBestEffortLatLng(): Promise<{
  lat: number;
  lng: number;
} | null> {
  const tg = await tryTelegramLocation();
  if (tg) return tg;
  return tryBrowserGeolocation();
}

async function tryTelegramLocation(): Promise<{ lat: number; lng: number } | null> {
  try {
    const WebApp = await loadWebApp();
    const LM = WebApp.LocationManager;
    if (!LM || typeof LM.init !== "function") return null;

    await Promise.race([
      new Promise<void>((resolve) => {
        LM.init(() => resolve());
      }),
      delay(10_000),
    ]);

    if (!LM.isInited || !LM.isLocationAvailable) return null;

    return await Promise.race([
      new Promise<{ lat: number; lng: number } | null>((resolve) => {
        try {
          LM.getLocation((data) => {
            if (!data || typeof data.latitude !== "number") {
              resolve(null);
              return;
            }
            resolve({ lat: data.latitude, lng: data.longitude });
          });
        } catch {
          resolve(null);
        }
      }),
      delay(25_000).then(() => null),
    ]);
  } catch {
    return null;
  }
}

function tryBrowserGeolocation(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 14_000, maximumAge: 30_000 }
    );
  });
}
