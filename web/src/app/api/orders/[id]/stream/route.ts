import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { applyNoShowIfNeeded } from "@/lib/order-lifecycle";

const Params = z.object({ id: z.string().uuid() });

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const { id } = Params.parse(params);
  const sb = getServiceSupabase();
  const { data: o } = await sb
    .from("orders")
    .select("client_id, worker_id")
    .eq("id", id)
    .maybeSingle();
  if (!o) {
    return new Response(JSON.stringify({ error: "Topilmadi" }), { status: 404 });
  }
  const ok =
    o.client_id === ctx.userId ||
    o.worker_id === ctx.userId ||
    ctx.role === "admin";
  if (!ok) {
    return new Response(JSON.stringify({ error: "Ruxsat yo'q" }), { status: 403 });
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      send({ type: "hello", orderId: id });
      let n = 0;
      const timer: { id?: ReturnType<typeof setInterval> } = {};
      const tick = async () => {
        if (n++ > 360) {
          if (timer.id) clearInterval(timer.id);
          controller.close();
          return;
        }
        await applyNoShowIfNeeded(id);
        const { data: row } = await sb
          .from("orders")
          .select("status, updated_at, accepted_at, work_started_at, completed_at, arrived_deadline_at")
          .eq("id", id)
          .maybeSingle();
        const { data: events } = await sb
          .from("order_events")
          .select("id, event_type, meta, created_at")
          .eq("order_id", id)
          .order("created_at", { ascending: false })
          .limit(5);
        send({ type: "tick", order: row, events });
      };
      await tick();
      timer.id = setInterval(() => {
        tick().catch(() => {
          if (timer.id) clearInterval(timer.id);
          controller.close();
        });
      }, 2500);
      req.signal.addEventListener("abort", () => {
        if (timer.id) clearInterval(timer.id);
        controller.close();
      });
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
