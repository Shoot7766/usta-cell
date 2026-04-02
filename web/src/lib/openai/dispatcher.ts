import OpenAI from "openai";
import { AiDispatcherSchema, type AiDispatcherResult } from "../types";

const SYSTEM = `Siz "Usta Call" xizmati uchun dispetchersiz. Foydalanuvchi muammosini qisqa va amaliy tarzda tahlil qiling.
Qoida: javoblar qisqa, buyruq uslubida. Chatbot emas — yo'naltiruvchi.
Har doim JSON qaytaring (boshqa matn yo'q). Maydonlar:
- category: xizmat turi (o'zbekcha qisqa)
- urgency: "low" | "medium" | "high"
- questions: 0-4 ta aniqlashtiruvchi savol (o'zbekcha)
- summary: 1-2 jumlada buyurtma xulosasi (o'zbekcha)
- tags: 2-8 ta kalit so'z (ingliz yoki o'zbek)
- price_min_cents, price_max_cents: ixtiyoriy, UZS tiyin (butun son). Agar noma'lum bo'lsa omit qiling.

Agar ma'lumot yetarli bo'lsa, questions bo'sh massiv bo'lishi mumkin.`;

export async function runDispatcherTurn(input: {
  userMessages: { role: "user" | "assistant"; content: string }[];
}): Promise<AiDispatcherResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return {
      category: "Umumiy xizmat",
      urgency: "medium",
      questions: ["Manzil bormi?", "Qachon qulay?"],
      summary: "So'rov qabul qilindi. Batafsil aniqlashtirish kerak.",
      tags: ["service"],
    };
  }
  const client = new OpenAI({ apiKey: key });
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.35,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      ...input.userMessages.slice(-20).map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }
  const base = {
    category: typeof (parsed as { category?: unknown }).category === "string"
      ? (parsed as { category: string }).category
      : "Xizmat",
    urgency: ["low", "medium", "high"].includes(
      String((parsed as { urgency?: unknown }).urgency)
    )
      ? (parsed as { urgency: "low" | "medium" | "high" }).urgency
      : "medium",
    questions: Array.isArray((parsed as { questions?: unknown }).questions)
      ? (parsed as { questions: string[] }).questions
      : [],
    summary:
      typeof (parsed as { summary?: unknown }).summary === "string"
        ? (parsed as { summary: string }).summary
        : "",
    tags: Array.isArray((parsed as { tags?: unknown }).tags)
      ? (parsed as { tags: string[] }).tags
      : [],
    price_min_cents: (parsed as { price_min_cents?: number }).price_min_cents,
    price_max_cents: (parsed as { price_max_cents?: number }).price_max_cents,
  };
  const safe = AiDispatcherSchema.safeParse(base);
  if (safe.success) return safe.data;
  return {
    category: base.category.slice(0, 120),
    urgency: base.urgency,
    questions: base.questions.slice(0, 4).map((q) => String(q).slice(0, 200)),
    summary: (base.summary || "So'rov").slice(0, 500),
    tags: base.tags.slice(0, 12).map((t) => String(t).slice(0, 40)),
  };
}
