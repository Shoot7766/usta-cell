import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireRole } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { scrapeOlxPage, adToImportText } from "@/lib/scrapers/olx";
import { importFromExternal } from "@/lib/external-import";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const denied = requireRole(ctx, ["admin"]);
  if (denied !== true) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON noto'g'ri" }, { status: 400 });
  }

  // Accept either sourceId (from import_sources table) or a direct URL
  const sourceId = typeof body.sourceId === "string" ? body.sourceId.trim() : null;
  const directUrl = typeof body.url === "string" ? body.url.trim() : null;

  let scrapeUrl = directUrl;
  let providerLabel = "OLX.uz";
  let provider = "olx";

  if (sourceId) {
    const sb = getServiceSupabase();
    const { data: source } = await sb
      .from("import_sources")
      .select("*")
      .eq("id", sourceId)
      .maybeSingle();

    if (!source) {
      return NextResponse.json({ error: "Manba topilmadi" }, { status: 404 });
    }
    if (!source.enabled) {
      return NextResponse.json({ error: "Manba o'chirilgan" }, { status: 400 });
    }
    scrapeUrl = source.identifier as string;
    providerLabel = (source.label as string | null) ?? scrapeUrl;
    provider = source.type as string;
  }

  if (!scrapeUrl) {
    return NextResponse.json({ error: "URL yoki sourceId kerak" }, { status: 400 });
  }

  // Ensure it's an HTTP URL
  if (!scrapeUrl.startsWith("http")) {
    return NextResponse.json({ error: "To'liq URL kerak (https://...)" }, { status: 400 });
  }

  let ads;
  try {
    ads = await scrapeOlxPage(scrapeUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Scraping xatosi: ${msg}` }, { status: 502 });
  }

  if (!ads.length) {
    return NextResponse.json({
      ok: true,
      scraped: 0,
      imported: 0,
      results: [],
      message: "Sahifada e'lon topilmadi (HTML tuzilishi o'zgargan bo'lishi mumkin)",
    });
  }

  const results: Array<{
    title: string;
    url: string;
    type: string;
    created: boolean;
    phone: string | null;
    error?: string;
  }> = [];

  let importedCount = 0;

  for (const ad of ads) {
    const text = adToImportText(ad);
    try {
      const result = await importFromExternal({
        provider,
        providerLabel,
        sourceUrl: ad.url,
        messageText: text,
        contactName: ad.contactName ?? undefined,
        contactPhone: ad.contactPhone ?? undefined,
        externalChatId: undefined,
        externalMessageId: ad.id,
        dedupeKey: ad.dedupeKey,
        rawPayload: {
          id: ad.id,
          title: ad.title,
          url: ad.url,
          location: ad.location,
          priceMin: ad.priceMin,
        },
      });

      if (result.type !== "irrelevant" && result.type !== "error") {
        importedCount++;
      }

      results.push({
        title: ad.title.slice(0, 80),
        url: ad.url,
        type: result.type,
        created: result.created,
        phone: result.phone,
        ...(result.type === "error" ? { error: result.summary } : {}),
      });
    } catch (err) {
      results.push({
        title: ad.title.slice(0, 80),
        url: ad.url,
        type: "error",
        created: false,
        phone: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    scraped: ads.length,
    imported: importedCount,
    results,
  });
}
