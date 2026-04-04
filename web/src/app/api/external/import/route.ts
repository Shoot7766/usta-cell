import { NextRequest, NextResponse } from "next/server";
import { importFromExternal } from "@/lib/external-import";

/**
 * POST /api/external/import
 *
 * Tashqi platformalar (OLX scraper, n8n, Make, custom bot) ushbu endpoint orqali
 * xabar yuboradi. AI xabarni tahlil qiladi va usta yoki mijoz profili yaratadi.
 *
 * Auth: Authorization: Bearer <EXTERNAL_IMPORT_SECRET>
 *       yoki x-import-secret: <EXTERNAL_IMPORT_SECRET>
 *
 * Body:
 *   provider       string  (required) — "olx" | "telegram" | "custom"
 *   text           string  (required) — xabar matni
 *   providerLabel? string  — "OLX Toshkent", "@kanal"
 *   sourceUrl?     string  — original post URL
 *   contactName?   string
 *   contactPhone?  string
 *   contactHandle? string
 *   chatId?        string
 *   messageId?     string
 *   dedupeKey?     string
 *   address?       string
 *   lat?           number
 *   lng?           number
 */
export async function POST(req: NextRequest) {
  const secret = (process.env.EXTERNAL_IMPORT_SECRET || "").trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "EXTERNAL_IMPORT_SECRET sozlanmagan" }, { status: 503 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const secretHeader = req.headers.get("x-import-secret") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : secretHeader.trim();

  if (token !== secret) {
    return NextResponse.json({ ok: false, error: "Ruxsat yo'q" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON noto'g'ri" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length < 5) {
    return NextResponse.json({ ok: false, error: "Matn juda qisqa" }, { status: 400 });
  }

  const provider = typeof body.provider === "string" && body.provider.trim()
    ? body.provider.trim()
    : "external";

  try {
    const result = await importFromExternal({
      provider,
      providerLabel: typeof body.providerLabel === "string" ? body.providerLabel : undefined,
      sourceUrl: typeof body.sourceUrl === "string" ? body.sourceUrl : undefined,
      messageText: text,
      contactName: typeof body.contactName === "string" ? body.contactName : undefined,
      contactPhone: typeof body.contactPhone === "string" ? body.contactPhone : undefined,
      contactHandle: typeof body.contactHandle === "string" ? body.contactHandle : undefined,
      externalChatId: typeof body.chatId === "string" ? body.chatId : undefined,
      externalMessageId: typeof body.messageId === "string" ? body.messageId : undefined,
      dedupeKey: typeof body.dedupeKey === "string" ? body.dedupeKey : undefined,
      address: typeof body.address === "string" ? body.address : undefined,
      lat: typeof body.lat === "number" ? body.lat : undefined,
      lng: typeof body.lng === "number" ? body.lng : undefined,
      rawPayload: body,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "Import xatosi" }, { status: 500 });
  }
}
