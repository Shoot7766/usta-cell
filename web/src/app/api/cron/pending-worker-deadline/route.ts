import { NextRequest, NextResponse } from "next/server";
import { applyPendingWorkerTimeouts } from "@/lib/order-lifecycle";

/** CRON_SECRET — muntazam chaqiring (masalan. har daqiqa). */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Rad etildi" }, { status: 401 });
  }
  const n = await applyPendingWorkerTimeouts();
  return NextResponse.json({ processed: n });
}
