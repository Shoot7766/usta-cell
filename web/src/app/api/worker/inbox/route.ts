import { NextResponse } from "next/server";
import { requireSession, requireRole, loadWorkerProfile } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { applyPendingWorkerTimeouts } from "@/lib/order-lifecycle";
import { lastImageCaptionFromConversation } from "@/lib/request-conversation";

export async function GET() {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const denied = requireRole(ctx, ["worker"]);
  if (denied !== true) return denied;
  const sb = getServiceSupabase();
  void applyPendingWorkerTimeouts();
  const { data: orders } = await sb
    .from("orders")
    .select("id, status, price_cents, eta_minutes, created_at, requests ( summary, category, address )")
    .eq("worker_id", ctx.userId)
    .in("status", ["new", "pending_worker"])
    .order("created_at", { ascending: false })
    .limit(30);
  const wp = await loadWorkerProfile(ctx.userId);
  const services = (wp?.services as string[]) ?? [];
  const { data: openRequests } = await sb
    .from("requests")
    .select(
      "id, summary, category, urgency, created_at, client_lat, client_lng, last_client_image_path, conversation"
    )
    .eq("status", "submitted")
    .order("created_at", { ascending: false })
    .limit(40);
  const filtered =
    openRequests?.filter((r: { category?: string | null }) => {
      const c = r.category || "";
      if (!c || !services.length) return true;
      return services.some((s) =>
        s.toLowerCase().includes(c.slice(0, 5).toLowerCase())
      );
    }) ?? [];

  const openRequestsOut = await Promise.all(
    filtered.map(async (row: Record<string, unknown>) => {
      const path =
        typeof row.last_client_image_path === "string" ? row.last_client_image_path.trim() : "";
      let last_client_image_url: string | null = null;
      if (path) {
        const { data: signed } = await sb.storage.from("usta_chat").createSignedUrl(path, 3600);
        last_client_image_url = signed?.signedUrl ?? null;
      }
      return {
        id: row.id as string,
        summary: row.summary as string | null | undefined,
        category: row.category as string | null | undefined,
        urgency: row.urgency as string | null | undefined,
        created_at: row.created_at as string,
        client_lat: row.client_lat as number | null | undefined,
        client_lng: row.client_lng as number | null | undefined,
        last_client_image_url,
        last_image_caption: lastImageCaptionFromConversation(row.conversation),
      };
    })
  );

  return NextResponse.json({ newOrders: orders ?? [], openRequests: openRequestsOut });
}
