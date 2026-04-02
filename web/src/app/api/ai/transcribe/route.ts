import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { requireSession, requireRole } from "@/lib/api-auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const MAX_BYTES = 24 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  const rl = rateLimit(`whisper:${ip}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Cheklov" }, { status: 429 });
  }
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const denied = requireRole(ctx, ["client"]);
  if (denied !== true) return denied;
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY sozlanmagan — ovozli xabar ishlamaydi" },
      { status: 503 }
    );
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Noto'g'ri" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Audio fayl yo'q" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Audio juda katta" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const name = file.name?.trim() || "voice.webm";
  const openai = new OpenAI({ apiKey: key });
  try {
    const f = await toFile(buf, name);
    const tr = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: f,
    });
    const text = (tr.text || "").trim();
    return NextResponse.json({ text });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Transkripsiya xatosi";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
