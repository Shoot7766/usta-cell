export type AdminStatsPayload = {
  usersTotal: number;
  clients: number;
  workers: number;
  admins: number;
  ordersTotal: number;
  ordersCompleted: number;
  topupPending: number;
  topupApprovedTotal: number;
};

function cnt(r: { count: number | null; error?: unknown }): number {
  if (r.error) return 0;
  return r.count ?? 0;
}

/** Service role Supabase client. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAdminStats(sb: any): Promise<AdminStatsPayload> {
  const [
    uAll,
    uClient,
    uWorker,
    uAdmin,
    oAll,
    oDone,
    tPen,
    tApp,
  ] = await Promise.all([
    sb.from("users").select("id", { count: "exact", head: true }),
    sb.from("users").select("id", { count: "exact", head: true }).eq("role", "client"),
    sb.from("users").select("id", { count: "exact", head: true }).eq("role", "worker"),
    sb.from("users").select("id", { count: "exact", head: true }).eq("role", "admin"),
    sb.from("orders").select("id", { count: "exact", head: true }),
    sb.from("orders").select("id", { count: "exact", head: true }).eq("status", "completed"),
    sb
      .from("worker_topup_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    sb
      .from("worker_topup_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved"),
  ]);

  return {
    usersTotal: cnt(uAll),
    clients: cnt(uClient),
    workers: cnt(uWorker),
    admins: cnt(uAdmin),
    ordersTotal: cnt(oAll),
    ordersCompleted: cnt(oDone),
    topupPending: cnt(tPen),
    topupApprovedTotal: cnt(tApp),
  };
}

export function formatAdminStatsUz(s: AdminStatsPayload, appUrl: string): string {
  const base = (appUrl || "").replace(/\/$/, "");
  const panel = base ? `${base}/admin` : "/admin";
  return (
    `📊 <b>Usta Call — qisqa statistika</b>\n\n` +
    `Foydalanuvchilar: <b>${s.usersTotal}</b> (mijoz: ${s.clients}, usta: ${s.workers}, admin: ${s.admins})\n` +
    `Buyurtmalar: <b>${s.ordersTotal}</b> (yakunlangan: ${s.ordersCompleted})\n` +
    `To‘ldirish so‘rovlari: kutilmoqda <b>${s.topupPending}</b>, tasdiqlangan jami <b>${s.topupApprovedTotal}</b>\n\n` +
    `🛠 Admin panel: ${panel}`
  );
}
