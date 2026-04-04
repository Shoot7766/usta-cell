import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireRole } from "@/lib/api-auth";
import { importFromExternal } from "@/lib/external-import";

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

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length < 5) {
    return NextResponse.json({ error: "Matn juda qisqa (min 5 belgi)" }, { status: 400 });
  }

  const provider = typeof body.provider === "string" && body.provider.trim()
    ? body.provider.trim()
    : "manual";
  const providerLabel = typeof body.providerLabel === "string" ? body.providerLabel.trim() : undefined;
  const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : undefined;
  const contactPhone = typeof body.contactPhone === "string" ? body.contactPhone.trim() : undefined;
  const contactName = typeof body.contactName === "string" ? body.contactName.trim() : undefined;

  const result = await importFromExternal({
    provider,
    providerLabel: providerLabel || provider,
    sourceUrl: sourceUrl || undefined,
    messageText: text,
    contactPhone: contactPhone || undefined,
    contactName: contactName || undefined,
    dedupeKey: `manual:${Date.now()}:${text.slice(0, 60)}`,
    rawPayload: body,
  });

  if (result.type === "error") {
    return NextResponse.json({ ok: false, result, error: result.summary || "Import xatosi" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, result });
}
