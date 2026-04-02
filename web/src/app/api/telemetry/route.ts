import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { logStructured } from "@/lib/observability";

const Body = z.object({
  level: z.enum(["error", "warn"]).default("error"),
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  url: z.string().max(500).optional(),
  digest: z.string().max(128).optional(),
});

/** Klient xatolarini server logiga (Vercel) yuborish — IP bo‘yicha qattiq limit. */
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  const rl = rateLimit(`telemetry:${ip}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  logStructured(body.level, body.message, {
    client: true,
    stack: body.stack,
    url: body.url,
    digest: body.digest,
    ip,
  });
  return NextResponse.json({ ok: true });
}
