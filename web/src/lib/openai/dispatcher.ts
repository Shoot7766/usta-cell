import OpenAI from "openai";
import { AiDispatcherSchema, type AiDispatcherResult } from "../types";
import { isLikelyClearServiceIntent } from "../ai-intent";

const SYSTEM = `Siz "Usta Call" uchun dispetchersiz. Maqsad: mijoz so'rovini tahlil qilib, mos usta tanlashga tayyorlash.

QAT'IY QOIDALAR:
1) Foydalanuvchi aniq xizmat aytsa (masalan rozetka, elektr, santexnika, plita ta'mirlash) — questions bo'sh massiv [] qiling. Ortiqcha savollar BERMANGL.
2) Faqat haqiqatan kerak bo'lsa 1 ta qisqa savol — ko'pchilik holatda savol yo'q.
3) JSONdan boshqa matn yo'q. Maydonlar:
- category: xizmat turi (o'zbekcha, qisqa)
- urgency: "low" | "medium" | "high"
- questions: [] yoki 1 ta qisqa savol (90% holatda [])
- summary: 1-2 jumlada xulosa
- reasoning: 2-4 jumla — qanday mutaxassis kerak, qaysi ko'nikmalar/kalit so'zlar bo'yicha ustani qidirish kerak, nimalarga e'tibor berish (xavfsizlik, tezlik, materiallar). O'zbekcha, aniq.
- tags: 2-8 ta kalit so'z (usta profilidagi xizmatlar bilan moslashishi mumkin)
- price_min_cents, price_max_cents: ixtiyoriy, UZS (butun so'mda taxminiy diapazon); noma'lum bo'lsa omit

Tezlik: savollarsiz yo'naltirish ustuvor; reasoning har doim to'ldirilsin (qisqa bo'lsa ham).`;

export type DispatcherOutput = AiDispatcherResult & {
  usedOpenAi: boolean;
};

function normalizeAiResult(
  base: AiDispatcherResult,
  lastUser: string,
  usedOpenAi: boolean
): DispatcherOutput {
  let questions = base.questions;
  if (isLikelyClearServiceIntent(lastUser)) {
    questions = [];
  }
  const merged = { ...base, questions };
  const safe = AiDispatcherSchema.safeParse(merged);
  if (safe.success) return { ...safe.data, usedOpenAi };
  return {
    category: merged.category.slice(0, 120),
    urgency: merged.urgency,
    questions: merged.questions,
    summary: merged.summary.slice(0, 500),
    reasoning: merged.reasoning?.slice(0, 2000),
    tags: merged.tags.slice(0, 12),
    usedOpenAi,
  };
}

function parseJsonToAi(raw: string): AiDispatcherResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }
  const base = {
    category:
      typeof (parsed as { category?: unknown }).category === "string"
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
    reasoning:
      typeof (parsed as { reasoning?: unknown }).reasoning === "string"
        ? (parsed as { reasoning: string }).reasoning
        : undefined,
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
    reasoning: base.reasoning?.slice(0, 2000),
    tags: base.tags.slice(0, 12).map((t) => String(t).slice(0, 40)),
  };
}

export async function runDispatcherTurn(input: {
  userMessages: { role: "user" | "assistant"; content: string }[];
  lastUserPlainText?: string;
  imageUrl?: string | null;
}): Promise<DispatcherOutput> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return {
      category: "Umumiy xizmat",
      urgency: "medium",
      questions: [],
      summary:
        "OPENAI_API_KEY sozlanmagan — tizim cheklangan rejimda. So'rovni tasdiqlab ustalarni ko'ring.",
      reasoning:
        "AI kaliti yo'q: ro'yxatdagi ustalarni reyting va masofa bo'yicha tanlang; xizmat turini so'rov matnidan moslashtiring.",
      tags: ["no-ai"],
      usedOpenAi: false,
    };
  }

  const lastUser =
    input.lastUserPlainText ??
    [...input.userMessages].reverse().find((m) => m.role === "user")?.content ??
    "";

  const client = new OpenAI({ apiKey: key });
  const slice = input.userMessages.slice(-12);
  const textBlob = slice
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  let raw: string;
  if (input.imageUrl) {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 520,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: input.imageUrl, detail: "low" },
            },
            {
              type: "text",
              text: `Suhbat konteksti:\n${textBlob}`,
            },
          ],
        },
      ],
    });
    raw = completion.choices[0]?.message?.content ?? "{}";
  } else {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 520,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: textBlob },
      ],
    });
    raw = completion.choices[0]?.message?.content ?? "{}";
  }

  const ai = parseJsonToAi(raw);
  return normalizeAiResult(ai, lastUser, true);
}
