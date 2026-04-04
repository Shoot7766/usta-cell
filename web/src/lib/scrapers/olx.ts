/**
 * OLX.uz scraper — extracts worker/service ads from listing pages.
 * Strategy:
 *  1. Fetch page HTML with browser headers (avoid bot detection)
 *  2. Extract __NEXT_DATA__ JSON (OLX uses Next.js SSR)
 *  3. Fall back to regex HTML extraction
 */

export type ScrapedAd = {
  id: string;
  title: string;
  description: string;
  url: string;
  location: string | null;
  priceMin: number | null;
  priceMax: number | null;
  contactName: string | null;
  contactPhone: string | null;
  dedupeKey: string;
};

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xhtml+xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "uz-UZ,uz;q=0.9,ru;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
};

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`OLX fetch failed: ${res.status} ${url}`);
  return res.text();
}

/** Extract price in soum from OLX price object */
function parseOlxPrice(priceObj: unknown): { min: number | null; max: number | null } {
  if (!priceObj || typeof priceObj !== "object") return { min: null, max: null };
  const p = priceObj as Record<string, unknown>;

  // OLX price structure: { value: number, currency: "UZS" }
  const regularPrice = typeof p["regularPrice"] === "object" ? (p["regularPrice"] as Record<string, unknown>) : null;
  const raw =
    typeof p["value"] === "number"
      ? (p["value"] as number)
      : regularPrice && typeof regularPrice["value"] === "number"
      ? (regularPrice["value"] as number)
      : null;

  if (raw === null || raw <= 0) return { min: null, max: null };
  return { min: raw, max: null };
}

/** Parse a single OLX ad JSON object into ScrapedAd */
function parseOlxAdJson(ad: Record<string, unknown>, baseUrl: string): ScrapedAd | null {
  const id = String(ad.id ?? ad.slug ?? "");
  if (!id) return null;

  const title = (
    typeof ad.title === "string" ? ad.title :
    typeof ad.name === "string" ? ad.name : ""
  ).trim();
  if (!title) return null;

  const params = typeof ad["params"] === "object" ? (ad["params"] as Record<string, unknown>) : null;
  const description = (
    typeof ad["description"] === "string" ? (ad["description"] as string) :
    typeof ad["body"] === "string" ? (ad["body"] as string) :
    params && typeof params["description"] === "string" ? (params["description"] as string) : ""
  ).trim();

  const url = (
    typeof ad.url === "string" ? ad.url :
    typeof ad.href === "string" ? ad.href :
    `${baseUrl}/${id}`
  );

  // Location
  const locObj: unknown = ad["location"] ?? ad["city"] ?? ad["region"];
  const locRecord = locObj && typeof locObj === "object" ? (locObj as Record<string, unknown>) : null;
  const locCity = locRecord?.["city"];
  const locCityRecord = locCity && typeof locCity === "object" ? (locCity as Record<string, unknown>) : null;
  const location =
    typeof locObj === "string" ? locObj :
    locCityRecord && typeof locCityRecord["name"] === "string" ? (locCityRecord["name"] as string) :
    locRecord && typeof locRecord["name"] === "string" ? (locRecord["name"] as string) :
    null;

  // Price
  const adPrice: unknown = ad["price"] ?? (params ? params["price"] : undefined);
  const { min: priceMin, max: priceMax } = parseOlxPrice(adPrice);

  // Contact
  const userRaw: unknown = ad["user"] ?? ad["contact"];
  const userObj: Record<string, unknown> = userRaw && typeof userRaw === "object" ? (userRaw as Record<string, unknown>) : {};
  const contactName =
    typeof userObj["name"] === "string" ? (userObj["name"] as string).trim() :
    typeof ad["userName"] === "string" ? (ad["userName"] as string).trim() : null;
  const contactPhone =
    typeof userObj["phone"] === "string" ? (userObj["phone"] as string).trim() :
    typeof ad["phone"] === "string" ? (ad["phone"] as string).trim() : null;

  const domain = new URL(baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`).hostname;
  const dedupeKey = `olx:${domain}:${id}`;

  return {
    id,
    title,
    description: description || title,
    url: url.startsWith("http") ? url : `https://www.olx.uz${url}`,
    location,
    priceMin,
    priceMax,
    contactName,
    contactPhone,
    dedupeKey,
  };
}

/** Drill into various possible Next.js JSON shapes to find the ads array */
function findAdsInNextData(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;

  type Rec = Record<string, unknown>;
  const props = typeof d["props"] === "object" ? (d["props"] as Rec) : null;
  const pp = props && typeof props["pageProps"] === "object" ? (props["pageProps"] as Rec) : null;
  const ppData = pp && typeof pp["data"] === "object" ? (pp["data"] as Rec) : null;
  const ppListing = pp && typeof pp["listing"] === "object" ? (pp["listing"] as Rec) : null;
  const ppDataListing = ppData && typeof ppData["listing"] === "object" ? (ppData["listing"] as Rec) : null;
  const ppInitial = pp && typeof pp["initialProps"] === "object" ? (pp["initialProps"] as Rec) : null;
  const ppInitialData = ppInitial && typeof ppInitial["data"] === "object" ? (ppInitial["data"] as Rec) : null;
  const dData = typeof d["data"] === "object" ? (d["data"] as Rec) : null;
  const dListing = typeof d["listing"] === "object" ? (d["listing"] as Rec) : null;

  const candidates: unknown[] = [
    ppData?.["ads"],
    ppListing?.["ads"],
    pp?.["ads"],
    ppDataListing?.["ads"],
    ppDataListing,
    ppInitialData?.["ads"],
    d["ads"],
    dData?.["ads"],
    dListing?.["ads"],
  ];

  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) {
      return c as Record<string, unknown>[];
    }
  }
  return [];
}

/** Extract from __NEXT_DATA__ script tag */
function extractFromNextData(html: string, sourceUrl: string): ScrapedAd[] | null {
  const m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m?.[1]) return null;

  let data: unknown;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return null;
  }

  const ads = findAdsInNextData(data);
  if (!ads.length) return null;

  const base = new URL(sourceUrl.startsWith("http") ? sourceUrl : `https://${sourceUrl}`).origin;
  return ads
    .map((a) => parseOlxAdJson(a, base))
    .filter((a): a is ScrapedAd => a !== null);
}

/** Extract from window.__PRELOADED_STATE__ or similar global assignments */
function extractFromWindowState(html: string, sourceUrl: string): ScrapedAd[] | null {
  const patterns = [
    /window\.__PRELOADED_STATE__\s*=\s*(\{)/,
    /window\.__INITIAL_STATE__\s*=\s*(\{)/,
    /"listing"\s*:\s*\{"ads"\s*:\s*(\[)/,
  ];
  for (const pat of patterns) {
    if (pat.test(html)) {
      // Try to extract JSON starting at the match — limited approach
      const m = html.match(/"ads"\s*:\s*(\[[\s\S]{0,200000}?\])\s*[,}]/);
      if (m?.[1]) {
        try {
          const ads = JSON.parse(m[1]) as Record<string, unknown>[];
          if (Array.isArray(ads) && ads.length > 0) {
            const base = new URL(sourceUrl.startsWith("http") ? sourceUrl : `https://${sourceUrl}`).origin;
            return ads
              .map((a) => parseOlxAdJson(a, base))
              .filter((a): a is ScrapedAd => a !== null);
          }
        } catch {
          /* ignore */
        }
      }
    }
  }
  return null;
}

/** Last-resort: extract ad snippets from raw HTML using regex */
function extractFromHtml(html: string, sourceUrl: string): ScrapedAd[] {
  const base = new URL(sourceUrl.startsWith("http") ? sourceUrl : `https://${sourceUrl}`).origin;
  const results: ScrapedAd[] = [];
  const seen = new Set<string>();

  // Find ad links with slugs: /obyavlenie/... or /item/... patterns
  const linkRe = /href="(\/(?:obyavlenie|item|ad)\/[^"?#]+)"/gi;
  const titleRe = /<(?:h[1-6]|span|div)[^>]*class="[^"]*(?:title|Title)[^"]*"[^>]*>([\s\S]{1,300}?)<\/(?:h[1-6]|span|div)>/gi;

  const links: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const href = m[1];
    if (!seen.has(href)) {
      seen.add(href);
      links.push(href);
    }
  }

  const titles: string[] = [];
  while ((m = titleRe.exec(html)) !== null) {
    const t = m[2].replace(/<[^>]+>/g, "").trim();
    if (t.length > 5) titles.push(t);
  }

  for (let i = 0; i < Math.min(links.length, 50); i++) {
    const href = links[i];
    const slug = href.split("/").filter(Boolean).pop() ?? href;
    const id = slug.replace(/[^a-z0-9\-_]/gi, "").slice(0, 80);
    const title = titles[i] || `E'lon #${i + 1}`;
    results.push({
      id,
      title,
      description: title,
      url: `${base}${href}`,
      location: null,
      priceMin: null,
      priceMax: null,
      contactName: null,
      contactPhone: null,
      dedupeKey: `olx:${base}:${id}`,
    });
  }
  return results;
}

/** OLX.uz worker service category URLs to scrape for bulk import */
export const OLX_WORKER_CATEGORIES = [
  { url: "https://www.olx.uz/uslugi/remont-i-stroitelstvo/", label: "Ta'mir va qurilish" },
  { url: "https://www.olx.uz/uslugi/bytovye-uslugi/",       label: "Maishiy xizmatlar" },
  { url: "https://www.olx.uz/uslugi/krasota-zdorove/",      label: "Go'zallik va salomatlik" },
  { url: "https://www.olx.uz/uslugi/",                      label: "Barcha xizmatlar" },
];

/**
 * Build an OLX URL with a date filter (last N days).
 * OLX uses search[filter_float_created_at:from]=UNIX_TIMESTAMP
 */
export function olxUrlWithDateFilter(baseUrl: string, days: number): string {
  const from = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}search%5Bfilter_float_created_at%3Afrom%5D=${from}&search%5Border%5D=created_at%3Adesc`;
}

/**
 * Main entry point. Scrapes a single OLX.uz listing page URL.
 * Returns up to 50 ads.
 * @param daysFilter - if provided, adds a created_at filter for last N days
 */
export async function scrapeOlxPage(url: string, daysFilter?: number): Promise<ScrapedAd[]> {
  const fetchUrl = daysFilter ? olxUrlWithDateFilter(url, daysFilter) : url;
  const html = await fetchHtml(fetchUrl);

  const fromNext = extractFromNextData(html, url);
  if (fromNext && fromNext.length > 0) return fromNext.slice(0, 50);

  const fromWindow = extractFromWindowState(html, url);
  if (fromWindow && fromWindow.length > 0) return fromWindow.slice(0, 50);

  return extractFromHtml(html, url).slice(0, 50);
}

/**
 * Build an importable text blob from a ScrapedAd.
 * The AI classifier will read this text.
 */
export function adToImportText(ad: ScrapedAd): string {
  const parts: string[] = [ad.title];
  if (ad.description && ad.description !== ad.title) parts.push(ad.description);
  if (ad.location) parts.push(`Joylashuv: ${ad.location}`);
  if (ad.contactName) parts.push(`Ism: ${ad.contactName}`);
  if (ad.contactPhone) parts.push(`Tel: ${ad.contactPhone}`);
  if (ad.priceMin) parts.push(`Narx: ${ad.priceMin.toLocaleString()} so'm`);
  return parts.join("\n");
}
