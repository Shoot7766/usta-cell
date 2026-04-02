import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireRole } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { appendOrderEvent } from "@/lib/order-lifecycle";
import { notifyWorkerNewOrder } from "@/lib/telegram-notify";
import { requestEligibleForMatchFlow } from "@/lib/service-match";

const Body = z.object({
  requestId: z.string().uuid(),
  workerId: z.string().uuid(),
  priceCents: z.number().int().positive().max(500_000_000).optional(),
  etaMinutes: z.number().int().min(5).max(24 * 60).optional(),
});

function defaultPriceCents(r: {
  price_min_cents: number | null;
  price_max_cents: number | null;
}): number {
  const rmin = r.price_min_cents;
  const rmax = r.price_max_cents;
  if (rmin != null && rmax != null && rmax >= rmin && rmin >= 0) {
    return Math.max(1, Math.round((rmin + rmax) / 2));
  }
  return 150_000;
}

function defaultEtaMinutes(urgency: string | null | undefined): number {
  if (urgency === "high") return 30;
  if (urgency === "low") return 60;
  return 45;
}

export async function POST(req: NextRequest) {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const denied = requireRole(ctx, ["client"]);
  if (denied !== true) return denied;
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Noto'g'ri" }, { status: 400 });
  }
  const sb = getServiceSupabase();
  const { data: r } = await sb
    .from("requests")
    .select("*")
    .eq("id", body.requestId)
    .maybeSingle();
  if (!r || r.client_id !== ctx.userId) {
    return NextResponse.json({ error: "So'rov topilmadi" }, { status: 404 });
  }
  if (!requestEligibleForMatchFlow(r as { status: string; summary?: string | null; category?: string | null })) {
    return NextResponse.json({ error: "So'rov holati mos emas" }, { status: 400 });
  }
  const { data: wu } = await sb
    .from("users")
    .select("id, role")
    .eq("id", body.workerId)
    .maybeSingle();
  if (!wu || wu.role !== "worker") {
    return NextResponse.json({ error: "Usta topilmadi" }, { status: 400 });
  }
  const { data: activeOrd } = await sb
    .from("orders")
    .select("id")
    .eq("request_id", body.requestId)
    .not("status", "eq", "canceled")
    .maybeSingle();
  if (activeOrd?.id) {
    return NextResponse.json(
      { error: "Bu so'rov bo'yicha allaqachon buyurtma bor" },
      { status: 400 }
    );
  }
  const priceCents =
    body.priceCents ??
    defaultPriceCents({
      price_min_cents: r.price_min_cents as number | null,
      price_max_cents: r.price_max_cents as number | null,
    });
  const etaMinutes =
    body.etaMinutes ?? defaultEtaMinutes(r.urgency as string | null | undefined);

  const clientImgPath =
    typeof r.last_client_image_path === "string" && r.last_client_image_path.trim()
      ? r.last_client_image_path.trim()
      : null;

  const { data: ord, error } = await sb
    .from("orders")
    .insert({
      request_id: body.requestId,
      client_id: ctx.userId,
      worker_id: body.workerId,
      status: "new",
      price_cents: priceCents,
      eta_minutes: etaMinutes,
      commission_cents: 0,
      client_issue_image_path: clientImgPath,
    })
    .select("id, contract_number")
    .single();
  if (error || !ord) {
    return NextResponse.json({ error: "Buyurtma yaratilmadi" }, { status: 500 });
  }
  await sb
    .from("requests")
    .update({ status: "matched", updated_at: new Date().toISOString() })
    .eq("id", body.requestId);
  await appendOrderEvent(ord.id as string, "created", {});

  const summaryText = String((r.summary as string) || "").trim() || "Yangi buyurtma";
  const { data: wuser } = await sb
    .from("users")
    .select("telegram_id")
    .eq("id", body.workerId)
    .maybeSingle();
  const tid = wuser?.telegram_id;
  const chatId =
    typeof tid === "bigint"
      ? Number(tid)
      : typeof tid === "number"
        ? tid
        : typeof tid === "string"
          ? parseInt(tid, 10)
          : NaN;
  if (Number.isFinite(chatId) && chatId > 0) {
    void notifyWorkerNewOrder({
      workerTelegramId: chatId,
      orderId: ord.id as string,
      contractNumber: ord.contract_number as string,
      summary: summaryText,
    });
  }

  return NextResponse.json({
    orderId: ord.id,
    contractNumber: ord.contract_number as string,
    price_cents: priceCents,
    eta_minutes: etaMinutes,
  });
}

export async function GET() {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const sb = getServiceSupabase();
  if (ctx.role === "client") {
    const { data } = await sb
      .from("orders")
      .select("*, requests(summary, category)")
      .eq("client_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    return NextResponse.json({ orders: data ?? [] });
  }
  if (ctx.role === "worker") {
    const { data } = await sb
      .from("orders")
      .select("*, requests(summary, category, address)")
      .eq("worker_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    return NextResponse.json({ orders: data ?? [] });
  }
  const { data } = await sb
    .from("orders")
    .select("*, requests(summary)")
    .order("created_at", { ascending: false })
    .limit(100);
  return NextResponse.json({ orders: data ?? [] });
}
