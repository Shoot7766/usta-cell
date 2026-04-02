import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api-auth";
import { setOrderStatus } from "@/lib/order-lifecycle";
import type { OrderStatus } from "@/lib/types";
const Params = z.object({ id: z.string().uuid() });
const Body = z.object({
  status: z.enum(["accepted", "in_progress", "completed"]),
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
  if (ctx.role !== "worker" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Ruxsat yo'q" }, { status: 403 });
  }
  const next = body.status as OrderStatus;
  const r = await setOrderStatus(id, next, {
    userId: ctx.userId,
    role: ctx.role === "admin" ? "admin" : "worker",
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
