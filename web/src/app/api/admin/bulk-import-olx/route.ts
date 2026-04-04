import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireRole } from "@/lib/api-auth";
import { scrapeOlxPage, adToImportText, OLX_WORKER_CATEGORIES } from "@/lib/scrapers/olx";
import { importFromExternal } from "@/lib/external-import";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const denied = requireRole(ctx, ["admin"]);
  if (denied !== true) return denied;

  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* empty body ok */ }

  const days = typeof body.days === "number" && body.days > 0 ? body.days : 7;
  // Optional: specific category indexes (0-3) or all
  const categoryIdxs: number[] =
    Array.isArray(body.categories)
      ? (body.categories as number[]).filter((n) => Number.isInteger(n) && n >= 0 && n < OLX_WORKER_CATEGORIES.length)
      : OLX_WORKER_CATEGORIES.map((_, i) => i);

  type AdResult = { title: string; url: string; type: string; created: boolean; phone: string | null; error?: string };
  type CatResult = { label: string; url: string; scraped: number; imported: number; results: AdResult[] };
  const categoryResults: CatResult[] = [];
  let totalScraped = 0;
  let totalImported = 0;

  for (const idx of categoryIdxs) {
    const cat = OLX_WORKER_CATEGORIES[idx];
    let ads;
    try {
      ads = await scrapeOlxPage(cat.url, days);
    } catch (err) {
      categoryResults.push({
        label: cat.label,
        url: cat.url,
        scraped: 0,
        imported: 0,
        results: [{ title: "Scraping xatosi", url: cat.url, type: "error", created: false, phone: null, error: err instanceof Error ? err.message : String(err) }],
      });
      continue;
    }

    const results: AdResult[] = [];
    let importedCount = 0;

    for (const ad of ads) {
      const text = adToImportText(ad);
      try {
        const result = await importFromExternal({
          provider: "olx",
          providerLabel: `OLX.uz — ${cat.label}`,
          sourceUrl: ad.url,
          messageText: text,
          contactName: ad.contactName ?? undefined,
          contactPhone: ad.contactPhone ?? undefined,
          externalMessageId: ad.id,
          dedupeKey: ad.dedupeKey,
          rawPayload: { id: ad.id, title: ad.title, url: ad.url, location: ad.location, priceMin: ad.priceMin, category: cat.label },
        });

        if (result.type === "worker_offer") importedCount++;
        results.push({
          title: ad.title.slice(0, 80),
          url: ad.url,
          type: result.type,
          created: result.created,
          phone: result.phone,
          ...(result.type === "error" ? { error: result.summary } : {}),
        });
      } catch (err) {
        results.push({ title: ad.title.slice(0, 80), url: ad.url, type: "error", created: false, phone: null, error: err instanceof Error ? err.message : String(err) });
      }
    }

    totalScraped += ads.length;
    totalImported += importedCount;
    categoryResults.push({ label: cat.label, url: cat.url, scraped: ads.length, imported: importedCount, results });
  }

  return NextResponse.json({
    ok: true,
    days,
    totalScraped,
    totalImported,
    categories: categoryResults,
  });
}
