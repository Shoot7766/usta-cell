import OpenAI from "openai";
import { AiDispatcherSchema, type AiDispatcherResult } from "../types";
import { isLikelyClearServiceIntent } from "../ai-intent";

/** Chuqur «tahlil» yo‘q — faqat moslashtirish uchun qisqa maydonlar. */
const SYSTEM = `Siz "Usta Call" uchun so'rovni sarlavha va kalit so'zlarga ajratuvchi modulsiz.

QAT'IY:
1) reasoning, tahlil, fikrlash, izoh paragraflari YO'Q — JSONda bunday maydon qo'shmang.
2) Foydalanuvchi aniq xizmat aytsa — questions [].
3) Faqat noaniq bo'lsa 1 ta qisqa savol (90% []).
4) Faqat JSON: category, urgency, questions, summary, tags, (ixtiyoriy) price_min_cents, price_max_cents.
5) summary: 1 qisqa jumla — nima ish kerak.
6) tags: 3–10 ta kalit so'z (usta profilidagi xizmatlar bilan moslashishi uchun).

Tezlik: savolsiz yo'naltirish ustuvor.`;

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
  const merged = { ...base, questions, reasoning: undefined };
  const safe = AiDispatcherSchema.safeParse(merged);
  if (safe.success) return { ...safe.data, reasoning: undefined, usedOpenAi };
  return {
    category: merged.category.slice(0, 120),
    urgency: merged.urgency,
    questions: merged.questions,
    summary: merged.summary.slice(0, 500),
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
      summary: "So'rov qabul qilindi. Mos ustalarni ro'yxatdan tanlang.",
      tags: ["xizmat"],
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
      temperature: 0.15,
      max_tokens: 380,
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
      temperature: 0.15,
      max_tokens: 380,
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
