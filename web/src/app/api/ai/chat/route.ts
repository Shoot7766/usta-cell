import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireRole } from "@/lib/api-auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { sanitizeText } from "@/lib/sanitize";
import { runDispatcherTurn } from "@/lib/openai/dispatcher";
import { getServiceSupabase } from "@/lib/supabase/admin";

const Body = z.object({
  requestId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
});

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
  const text = sanitizeText(body.message, 4000);
  const sb = getServiceSupabase();
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
  conversation.push({ role: "user", content: text });
  const ai = await runDispatcherTurn({ userMessages: conversation });
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
  return NextResponse.json({
    requestId,
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
