import { getServiceSupabase } from "./supabase/admin";
import {
  notifyClientWorkerAccepted,
  parseTelegramChatId,
} from "./telegram-notify";
import {
  ARRIVAL_DEADLINE_MINUTES,
  CLIENT_CANCEL_PENALTY_CENTS,
  COMMISSION_BPS,
  LEAD_UNLOCK_CENTS,
  NO_SHOW_PENALTY_RATING,
  WORKER_CANCEL_RATING_DELTA,
} from "./constants";
import type { OrderStatus } from "./types";

export async function appendOrderEvent(
  orderId: string,
  eventType: string,
  meta: Record<string, unknown> = {}
) {
  const sb = getServiceSupabase();
  await sb.from("order_events").insert({
    order_id: orderId,
    event_type: eventType,
    meta,
  });
}

export function computeCommission(priceCents: number): number {
  return Math.floor((priceCents * COMMISSION_BPS) / 10000);
}

export async function applyNoShowIfNeeded(orderId: string): Promise<boolean> {
  const sb = getServiceSupabase();
  const { data: o } = await sb
    .from("orders")
    .select("id, status, arrived_deadline_at, worker_id, no_show_flag")
    .eq("id", orderId)
    .maybeSingle();
  if (!o || o.no_show_flag) return false;
  if (o.status !== "accepted") return false;
  const deadline = o.arrived_deadline_at
    ? new Date(o.arrived_deadline_at).getTime()
    : 0;
  if (!deadline || Date.now() < deadline) return false;
  const workerId = o.worker_id as string;
  await sb
    .from("orders")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      canceled_by: "system",
      cancel_reason: "No-show: usta kelmedi",
      no_show_flag: true,
      worker_rating_delta: NO_SHOW_PENALTY_RATING,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);
  const { data: wp } = await sb
    .from("worker_profiles")
    .select("rating_avg, rating_count, no_show_strikes")
    .eq("user_id", workerId)
    .maybeSingle();
  if (wp) {
    const count = Math.max(1, (wp.rating_count as number) || 1);
    const avg = Number(wp.rating_avg) || 4.5;
    const next = Math.max(1, avg - NO_SHOW_PENALTY_RATING / Math.sqrt(count));
    await sb
      .from("worker_profiles")
      .update({
        rating_avg: next,
        no_show_strikes: (wp.no_show_strikes as number) + 1,
      })
      .eq("user_id", workerId);
  }
  await appendOrderEvent(orderId, "no_show", {});
  return true;
}

export async function cancelOrderByClient(orderId: string, clientId: string) {
  const sb = getServiceSupabase();
  const { data: o } = await sb
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (!o || o.client_id !== clientId) {
    return { ok: false as const, error: "Buyurtma topilmadi" };
  }
  if (o.status === "completed" || o.status === "canceled") {
    return { ok: false as const, error: "Holat bekor qilishga yaroqsiz" };
  }
  let client_penalty_cents = 0;
  if (o.status !== "new") {
    client_penalty_cents = CLIENT_CANCEL_PENALTY_CENTS;
  }
  await sb
    .from("orders")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      canceled_by: "client",
      client_penalty_cents,
      cancel_reason: "Mijoz bekor qildi",
    })
    .eq("id", orderId);
  if (client_penalty_cents > 0) {
    await sb.from("transactions").insert({
      user_id: clientId,
      order_id: orderId,
      type: "penalty_client",
      amount_cents: -client_penalty_cents,
      meta: { reason: "late_cancel" },
    });
  }
  await appendOrderEvent(orderId, "canceled_client", { client_penalty_cents });
  return { ok: true as const, client_penalty_cents };
}

export async function cancelOrderByWorker(orderId: string, workerId: string) {
  const sb = getServiceSupabase();
  const { data: o } = await sb
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (!o || o.worker_id !== workerId) {
    return { ok: false as const, error: "Buyurtma topilmadi" };
  }
  if (o.status === "completed" || o.status === "canceled") {
    return { ok: false as const, error: "Holat bekor qilishga yaroqsiz" };
  }
  await sb
    .from("orders")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      canceled_by: "worker",
      worker_rating_delta: WORKER_CANCEL_RATING_DELTA,
      cancel_reason: "Usta bekor qildi",
    })
    .eq("id", orderId);
  const { data: wp } = await sb
    .from("worker_profiles")
    .select("rating_avg, rating_count, cancel_strikes")
    .eq("user_id", workerId)
    .maybeSingle();
  if (wp) {
    const count = Math.max(1, (wp.rating_count as number) || 1);
    const avg = Number(wp.rating_avg) || 4.5;
    const next = Math.max(1, avg - WORKER_CANCEL_RATING_DELTA / Math.sqrt(count));
    await sb
      .from("worker_profiles")
      .update({
        rating_avg: next,
        cancel_strikes: (wp.cancel_strikes as number) + 1,
      })
      .eq("user_id", workerId);
  }
  await appendOrderEvent(orderId, "canceled_worker", {});
  return { ok: true as const };
}

const transitions: Record<
  OrderStatus,
  Partial<Record<OrderStatus, true>>
> = {
  new: { accepted: true, canceled: true },
  accepted: { in_progress: true, canceled: true },
  in_progress: { completed: true, canceled: true },
  completed: {},
  canceled: {},
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return Boolean(transitions[from]?.[to]);
}

export async function setOrderStatus(
  orderId: string,
  next: OrderStatus,
  actor: { userId: string; role: "client" | "worker" | "admin" }
): Promise<{ ok: boolean; error?: string }> {
  const sb = getServiceSupabase();
  const { data: o } = await sb
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (!o) return { ok: false, error: "Topilmadi" };
  const cur = o.status as OrderStatus;
  if (!canTransition(cur, next)) return { ok: false, error: "Noto'g'ri o'tish" };
  if (actor.role === "worker") {
    if (o.worker_id !== actor.userId) return { ok: false, error: "Ruxsat yo'q" };
    if (next === "accepted" && cur === "new") {
      /* ok */
    } else if (next === "in_progress" && cur === "accepted") {
      /* ok */
    } else if (next === "completed" && cur === "in_progress") {
      /* ok */
    } else if (next === "canceled") {
      return { ok: false, error: "Bekor API dan foydalaning" };
    } else return { ok: false, error: "Ruxsat yo'q" };
  } else if (actor.role === "client") {
    if (o.client_id !== actor.userId) return { ok: false, error: "Ruxsat yo'q" };
    return { ok: false, error: "Mijoz holatni o'zgartira olmaydi" };
  } else if (actor.role !== "admin") {
    return { ok: false, error: "Ruxsat yo'q" };
  }
  const patch: Record<string, unknown> = { status: next, updated_at: new Date().toISOString() };
  const now = new Date().toISOString();
  if (next === "accepted") {
    patch.accepted_at = now;
    patch.arrived_deadline_at = new Date(
      Date.now() + ARRIVAL_DEADLINE_MINUTES * 60 * 1000
    ).toISOString();
    patch.commission_cents = computeCommission((o.price_cents as number) || 0);
  }
  if (next === "in_progress") patch.work_started_at = now;
  if (next === "completed") patch.completed_at = now;
  await sb.from("orders").update(patch).eq("id", orderId);
  await appendOrderEvent(orderId, `status_${next}`, { by: actor.role });
  if (next === "accepted" && actor.role === "worker") {
    void (async () => {
      try {
        const [{ data: cu }, { data: wu }, { data: rq }] = await Promise.all([
          sb
            .from("users")
            .select("telegram_id")
            .eq("id", o.client_id as string)
            .maybeSingle(),
          sb
            .from("users")
            .select("display_name")
            .eq("id", o.worker_id as string)
            .maybeSingle(),
          sb
            .from("requests")
            .select("summary")
            .eq("id", o.request_id as string)
            .maybeSingle(),
        ]);
        const tid = parseTelegramChatId(cu?.telegram_id);
        if (tid) {
          await notifyClientWorkerAccepted({
            clientTelegramId: tid,
            orderId,
            workerName: String((wu?.display_name as string) || "Usta"),
            summary: String((rq?.summary as string) || ""),
          });
        }
      } catch {
        /* bildirishnoma ixtiyoriy */
      }
    })();
  }
  return { ok: true };
}

export { LEAD_UNLOCK_CENTS };
