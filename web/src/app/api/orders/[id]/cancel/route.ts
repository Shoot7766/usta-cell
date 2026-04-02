import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api-auth";
import { cancelOrderByClient, cancelOrderByWorker } from "@/lib/order-lifecycle";

const Params = z.object({ id: z.string().uuid() });
const Body = z.object({
  as: z.enum(["client", "worker"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const { id } = Params.parse(params);
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Noto'g'ri" }, { status: 400 });
  }
  if (body.as === "client" && ctx.role !== "client") {
    return NextResponse.json({ error: "Ruxsat yo'q" }, { status: 403 });
  }
  if (body.as === "worker" && ctx.role !== "worker") {
    return NextResponse.json({ error: "Ruxsat yo'q" }, { status: 403 });
  }
  if (body.as === "client") {
    const r = await cancelOrderByClient(id, ctx.userId);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, client_penalty_cents: r.client_penalty_cents });
  }
  const r = await cancelOrderByWorker(id, ctx.userId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
