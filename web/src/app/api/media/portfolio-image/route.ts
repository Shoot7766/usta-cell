import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireSession, requireRole } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 4_000_000;
const BUCKET = "usta_portfolio";

/** Usta portfolio uchun rasm (Telegram Mini App galereya/kamera → FormData). */
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  const rl = rateLimit(`portimg:${ip}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Cheklov" }, { status: 429 });
  }
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const denied = requireRole(ctx, ["worker"]);
  if (denied !== true) return denied;
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Noto'g'ri" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fayl yo'q" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Rasm juda katta (max ~4 MB)" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "Faqat JPEG, PNG yoki WebP" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const ext =
    file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${ctx.userId}/${randomUUID()}.${ext}`;
  const sb = getServiceSupabase();
  const { error } = await sb.storage.from(BUCKET).upload(path, buf, {
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl, path });
}
