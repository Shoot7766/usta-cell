import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireRole } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { appendOrderEvent } from "@/lib/order-lifecycle";
import { MARKET_RESERVE_DEADLINE_MINUTES } from "@/lib/constants";
import { notifyClientMarketReserved, parseTelegramChatId } from "@/lib/telegram-notify";
import { requestEligibleForMatchFlow } from "@/lib/service-match";

const Body = z.object({
  requestId: z.string().uuid(),
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

/** Bozor so‘rovini band qilish: buyurtma pending_worker, mijoz kontakti ochiq. */
export async function POST(req: NextRequest) {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const denied = requireRole(ctx, ["worker"]);
  if (denied !== true) return denied;
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Noto'g'ri" }, { status: 400 });
  }
  const sb = getServiceSupabase();
  const { data: r } = await sb.from("requests").select("*").eq("id", body.requestId).maybeSingle();
  if (!r || (r.status as string) !== "submitted") {
    return NextResponse.json({ error: "So'rov bozorda emas yoki topilmadi" }, { status: 400 });
  }
  if (
    !requestEligibleForMatchFlow(
      r as { status: string; summary?: string | null; category?: string | null }
    )
  ) {
    return NextResponse.json({ error: "So'rov hali tayyor emas" }, { status: 400 });
  }
  const { data: active } = await sb
    .from("orders")
    .select("id")
    .eq("request_id", body.requestId)
    .not("status", "eq", "canceled")
    .maybeSingle();
  if (active?.id) {
    return NextResponse.json(
      { error: "Bu so'rov bo'yicha allaqachon buyurtma bor" },
      { status: 400 }
    );
  }
  const deadline = new Date(
    Date.now() + MARKET_RESERVE_DEADLINE_MINUTES * 60 * 1000
  ).toISOString();
  const priceCents = defaultPriceCents({
    price_min_cents: r.price_min_cents as number | null,
    price_max_cents: r.price_max_cents as number | null,
  });
  const etaMinutes = defaultEtaMinutes(r.urgency as string | null | undefined);
  const clientImgPath =
    typeof r.last_client_image_path === "string" && r.last_client_image_path.trim()
      ? r.last_client_image_path.trim()
      : null;

  const { data: ord, error } = await sb
    .from("orders")
    .insert({
      request_id: body.requestId,
      client_id: r.client_id as string,
      worker_id: ctx.userId,
      status: "pending_worker",
      price_cents: priceCents,
      eta_minutes: etaMinutes,
      commission_cents: 0,
      client_issue_image_path: clientImgPath,
      worker_decision_deadline_at: deadline,
    })
    .select("id, contract_number")
    .single();
  if (error || !ord) {
    return NextResponse.json({ error: "Buyurtma yaratilmadi" }, { status: 500 });
  }
  const orderId = ord.id as string;
  await sb
    .from("requests")
    .update({ status: "matched", updated_at: new Date().toISOString() })
    .eq("id", body.requestId);
  const { data: exLead } = await sb
    .from("worker_leads")
    .select("id")
    .eq("request_id", body.requestId)
    .eq("worker_id", ctx.userId)
    .maybeSingle();
  const leadNow = new Date().toISOString();
  if (exLead?.id) {
    await sb.from("worker_leads").update({ unlocked_at: leadNow }).eq("id", exLead.id as string);
  } else {
    await sb.from("worker_leads").insert({
      request_id: body.requestId,
      worker_id: ctx.userId,
      cost_cents: 0,
      unlocked_at: leadNow,
    });
  }
  await appendOrderEvent(orderId, "market_reserved", {
    deadline_at: deadline,
  });

  const summaryText = String((r.summary as string) || "").trim() || "Bozor so'rovi";
  const [{ data: wuser }, { data: cuser }] = await Promise.all([
    sb.from("users").select("display_name").eq("id", ctx.userId).maybeSingle(),
    sb.from("users").select("telegram_id").eq("id", r.client_id as string).maybeSingle(),
  ]);
  const cTid = parseTelegramChatId(cuser?.telegram_id);
  if (cTid) {
    void notifyClientMarketReserved({
      clientTelegramId: cTid,
      orderId,
      workerName: String((wuser?.display_name as string) || "Usta"),
      summary: summaryText,
    });
  }

  return NextResponse.json({
    orderId,
    contractNumber: ord.contract_number as string,
    decisionDeadlineAt: deadline,
  });
}
