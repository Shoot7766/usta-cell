import OpenAI from "openai";
import { AiDispatcherSchema, type AiDispatcherResult } from "../types";
import { isLikelyClearServiceIntent } from "../ai-intent";

/**
 * Haqiqiy suhbat: OpenAI JSON rejimi — assistant_message mijozga ko‘rinadi,
 * qolgan maydonlar bazada va mos usta qidiruvi uchun.
 */
const SYSTEM = `Siz "Usta Call" Telegram mini ilovasida ishlaydigan aqlli yordamchisiz. Vazifa: mijoz bilan tabiiy suhbat qilib, qanday usta va qanday ish ekanini aniqlash, kerak bo‘lsa ish joyi/manzil va vaqtni aniqlash, imkon qadar muammo yoki ish joyini ko‘rish uchun rasm yuborishni muloyimlik bilan so‘rash.

QOIDALAR:
1) Faqat o‘zbek tilida yozing (lotin harflari). Do‘stona, hurmatli, qisqa bo‘lsa ham to‘liq javob bering.
2) Agar mijoz faqat "salom", "menga usta kerak" desa — salomlang, qanday yo‘nalish (elektr, santex, ta’mir va hokazo) va taxminan nima ish ekanini so‘rang.
3) Bir nechta savolni bitta xabarda berishingiz mumkin (masalan: qayerda, qachon, qanday muammo).
4) Agar rasm foydali bo‘lsa (muammo joyi, detal), "agar qulay bo‘lsa, rasm yuboring" deb so‘rang — majburiy emas.
5) Mijoz aniq xizmat va muammoni aytsa (masalan rozetka, santex), savollarni kamaytiring; questions massivini [] qiling yoki bitta aniqlashtiruv qoldiring.
6) JSONdan boshqa matn yo‘q. Barcha mijozga ko‘rinadigan matn faqat maydon "assistant_message" ichida bo‘lsin.

JSON format (majburiy maydonlar):
{
  "assistant_message": "Mijozga ko‘rinadigan to‘liq javob matni",
  "category": "qisqa xizmat turi (masalan Elektr, Santex)",
  "urgency": "low" | "medium" | "high",
  "summary": "Ichki qisqa xulosa — moslash va qidiruv uchun (1-2 jumla)",
  "tags": ["3-12", "kalit", "so'z"],
  "questions": ["hali javobsiz qolgan aniq savollar"] yoki [] agar ustalarni ko‘rsatish uchun yetarli ma'lumot bo'lsa
}

questions bo'sh [] bo'lsa — tizim mos ustalarni chiqaradi. Bo'sh bo'lmasa — savollar tugaguncha kutadi.`;

export type DispatcherOutput = AiDispatcherResult & {
  usedOpenAi: boolean;
};

function displayMessageFromResult(base: AiDispatcherResult): string {
  const am = base.assistant_message?.trim();
  if (am) return am;
  const s = base.summary?.trim();
  if (s) return s;
  if (base.questions.length > 0) {
    return base.questions.join("\n\n");
  }
  return "Davom eting — qisqacha yozing.";
}

function normalizeAiResult(
  base: AiDispatcherResult,
  lastUser: string,
  usedOpenAi: boolean
): DispatcherOutput {
  let questions = base.questions;
  if (isLikelyClearServiceIntent(lastUser)) {
    questions = [];
  }
  const merged: AiDispatcherResult = {
    ...base,
    questions,
    assistant_message: base.assistant_message ?? displayMessageFromResult({ ...base, questions }),
    reasoning: undefined,
  };
  const safe = AiDispatcherSchema.safeParse(merged);
  if (safe.success) return { ...safe.data, reasoning: undefined, usedOpenAi };
  return {
    assistant_message: displayMessageFromResult(merged),
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
  const p = parsed as Record<string, unknown>;
  const base = {
    assistant_message:
      typeof p.assistant_message === "string" ? p.assistant_message : undefined,
    category:
      typeof p.category === "string" ? p.category : "Xizmat",
    urgency: ["low", "medium", "high"].includes(String(p.urgency))
      ? (p.urgency as "low" | "medium" | "high")
      : "medium",
    questions: Array.isArray(p.questions) ? (p.questions as string[]) : [],
    summary: typeof p.summary === "string" ? p.summary : "",
    tags: Array.isArray(p.tags) ? (p.tags as string[]) : [],
    price_min_cents: p.price_min_cents as number | undefined,
    price_max_cents: p.price_max_cents as number | undefined,
  };
  const safe = AiDispatcherSchema.safeParse(base);
  if (safe.success) return safe.data;
  return {
    assistant_message: base.assistant_message,
    category: base.category.slice(0, 120),
    urgency: base.urgency,
    questions: base.questions.slice(0, 6).map((q) => String(q).slice(0, 300)),
    summary: (base.summary || "So'rov").slice(0, 500),
    tags: base.tags.slice(0, 12).map((t) => String(t).slice(0, 40)),
  };
}

export async function runDispatcherTurn(input: {
  userMessages: { role: "user" | "assistant"; content: string }[];
  lastUserPlainText?: string;
  imageUrl?: string | null;
}): Promise<DispatcherOutput> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return {
      assistant_message:
        "Hozircha AI kaliti ulangan emas. Iltimos, qisqacha qanday ish va qaysi yo‘nalish (elektr, santex…) ekanligini yozing — keyin ustalarni ko‘rsatamiz.",
      category: "Umumiy xizmat",
      urgency: "medium",
      questions: [],
      summary: "Kalit sozlanmagan",
      tags: ["xizmat"],
      usedOpenAi: false,
    };
  }

  const lastUser =
    input.lastUserPlainText ??
    [...input.userMessages].reverse().find((m) => m.role === "user")?.content ??
    "";

  const client = new OpenAI({ apiKey: key });
  const slice = input.userMessages.slice(-16);
  const textBlob = slice
    .map((m) => `${m.role === "user" ? "Mijoz" : "Yordamchi"}: ${m.content}`)
    .join("\n");

  let raw: string;
  if (input.imageUrl) {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.45,
      max_tokens: 1100,
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
              text: `Suhbat tarix:\n${textBlob}\n\n(Rasm mijoz tomonidan yuborildi — agar kerak bo‘lsa, tavsiflang va keyingi savollarni bering.)`,
            },
          ],
        },
      ],
    });
    raw = completion.choices[0]?.message?.content ?? "{}";
  } else {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.45,
      max_tokens: 1100,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Suhbat tarix:\n${textBlob}\n\nYuqoridagi oxirgi mijoz xabariga javob bering (JSON formatida, assistant_message da to‘liq matn).`,
        },
      ],
    });
    raw = completion.choices[0]?.message?.content ?? "{}";
  }

  const ai = parseJsonToAi(raw);
  return normalizeAiResult(ai, lastUser, true);
}
