import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { applyNoShowIfNeeded } from "@/lib/order-lifecycle";

const Params = z.object({ id: z.string().uuid() });

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const { id } = Params.parse(params);
  const sb = getServiceSupabase();
  await applyNoShowIfNeeded(id);
  const { data: o } = await sb
    .from("orders")
    .select("*, requests (*)")
    .eq("id", id)
    .maybeSingle();
  if (!o) return NextResponse.json({ error: "Topilmadi" }, { status: 404 });
  const isClient = o.client_id === ctx.userId;
  const isWorker = o.worker_id === ctx.userId;
  const isAdmin = ctx.role === "admin";
  if (!isClient && !isWorker && !isAdmin) {
    return NextResponse.json({ error: "Ruxsat yo'q" }, { status: 403 });
  }
  const requestId = o.request_id as string;
  let phoneUnlocked = isClient || isAdmin;
  if (isWorker && !isAdmin) {
    const { data: lead } = await sb
      .from("worker_leads")
      .select("id")
      .eq("request_id", requestId)
      .eq("worker_id", ctx.userId)
      .maybeSingle();
    phoneUnlocked = Boolean(lead);
  }
  const [{ data: client }, { data: worker }] = await Promise.all([
    sb
      .from("users")
      .select("id, display_name, phone")
      .eq("id", o.client_id as string)
      .maybeSingle(),
    sb
      .from("users")
      .select("id, display_name, phone")
      .eq("id", o.worker_id as string)
      .maybeSingle(),
  ]);
  const clientPhoneOk = isClient || isAdmin || phoneUnlocked;
  const c = client
    ? {
        ...client,
        phone: clientPhoneOk ? client.phone : client.phone ? "***" : null,
      }
    : null;
  const showWorkerPhone =
    isWorker || isAdmin || (isClient && o.status !== "new" && o.status !== "canceled");
  const workerOut = worker
    ? {
        ...worker,
        phone: showWorkerPhone ? worker.phone : worker.phone ? "***" : null,
      }
    : null;
  const { data: events } = await sb
    .from("order_events")
    .select("*")
    .eq("order_id", id)
    .order("created_at", { ascending: true });

  let clientIssueImageUrl: string | null = null;
  const imgPath =
    typeof o.client_issue_image_path === "string" ? o.client_issue_image_path.trim() : "";
  if (imgPath) {
    const { data: signed } = await sb.storage.from("usta_chat").createSignedUrl(imgPath, 7200);
    clientIssueImageUrl = signed?.signedUrl ?? null;
  }

  return NextResponse.json({
    order: {
      ...o,
      client: c,
      worker: workerOut,
      client_issue_image_url: clientIssueImageUrl,
    },
    events: events ?? [],
  });
}
