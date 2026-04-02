import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireRole } from "@/lib/api-auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { sanitizeText } from "@/lib/sanitize";
import { runDispatcherTurn } from "@/lib/openai/dispatcher";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { chatImagePathToDataUrl } from "@/lib/chat-image";

const Body = z
  .object({
    requestId: z.string().uuid().optional(),
    message: z.string().max(4000).optional(),
    imagePath: z.string().max(512).optional(),
  })
  .refine(
    (b) => {
      const m = (b.message ?? "").trim();
      const p = (b.imagePath ?? "").trim();
      return m.length > 0 || p.length > 0;
    },
    { message: "Matn yoki rasm yo'li kerak" }
  );

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  const rl = rateLimit(`ai:${ip}`, 40, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Cheklov" }, { status: 429 });
  }
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  const denied = requireRole(ctx, ["client"]);
  if (denied !== true) return denied;
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Noto'g'ri so'rov" }, { status: 400 });
  }
  const rawMsg = (body.message ?? "").trim();
  const text = rawMsg ? sanitizeText(rawMsg, 4000) : "";
  const imagePath = (body.imagePath ?? "").trim();
  const sb = getServiceSupabase();
  let dataUrl: string | null = null;
  if (imagePath) {
    dataUrl = await chatImagePathToDataUrl(sb, imagePath, ctx.userId);
    if (!dataUrl) {
      return NextResponse.json({ error: "Rasm topilmadi yoki ruxsat yo'q" }, { status: 400 });
    }
  }
  let requestId = body.requestId;
  let conversation: { role: "user" | "assistant"; content: string }[] = [];
  if (requestId) {
    const { data: r } = await sb
      .from("requests")
      .select("id, client_id, conversation")
      .eq("id", requestId)
      .maybeSingle();
    if (!r || r.client_id !== ctx.userId) {
      return NextResponse.json({ error: "So'rov topilmadi" }, { status: 404 });
    }
    conversation = (r.conversation as typeof conversation) ?? [];
  } else {
    const { data: ins } = await sb
      .from("requests")
      .insert({
        client_id: ctx.userId,
        status: "draft",
        conversation: [],
      })
      .select("id")
      .single();
    requestId = ins?.id as string;
  }
  const userLine =
    [text, imagePath ? "[Rasm yuborildi]" : ""].filter(Boolean).join("\n\n") ||
    "[Rasm yuborildi]";
  conversation.push({ role: "user", content: userLine });
  const ai = await runDispatcherTurn({
    userMessages: conversation,
    lastUserPlainText: text || (imagePath ? "" : userLine),
    imageUrl: dataUrl,
  });
  const assistantLine = [
    ai.summary,
    ai.questions.length ? `Savollar: ${ai.questions.join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  conversation.push({ role: "assistant", content: assistantLine });
  const structured = {
    category: ai.category,
    urgency: ai.urgency,
    tags: ai.tags,
    questions: ai.questions,
    price_min_cents: ai.price_min_cents,
    price_max_cents: ai.price_max_cents,
  };
  await sb
    .from("requests")
    .update({
      conversation,
      structured,
      summary: ai.summary,
      category: ai.category,
      urgency: ai.urgency,
      tags: ai.tags,
      price_min_cents: ai.price_min_cents ?? null,
      price_max_cents: ai.price_max_cents ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  const readyToMatch = ai.questions.length === 0;
  return NextResponse.json({
    requestId,
    usedOpenAi: ai.usedOpenAi,
    readyToMatch,
    ai: {
      category: ai.category,
      urgency: ai.urgency,
      questions: ai.questions,
      summary: ai.summary,
      tags: ai.tags,
      price_min_cents: ai.price_min_cents,
      price_max_cents: ai.price_max_cents,
    },
  });
}
