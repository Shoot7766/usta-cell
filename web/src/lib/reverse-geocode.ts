/**
 * Faqat shahar (yoki tuman) nomi — Nominatim (OSM). Brauzerda chaqirish.
 * https://operations.osmfoundation.org/policies/nominatim/
 */
export async function reverseGeocodeCity(
  lat: number,
  lng: number
): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "json");
  url.searchParams.set("accept-language", "uz,ru,en");
  url.searchParams.set("zoom", "10");
  try {
    const r = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "UstaCall/1.0 (contact: support@ustacall.local)",
      },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      address?: {
        city?: string;
        town?: string;
        village?: string;
        municipality?: string;
        state?: string;
        county?: string;
      };
    };
    const a = j.address;
    if (!a) return null;
    const name =
      a.city ||
      a.town ||
      a.municipality ||
      a.village ||
      a.county ||
      a.state ||
      null;
    return name ? name.trim().slice(0, 120) : null;
  } catch {
    return null;
  }
}
