import OpenAI from "openai";

export type ExternalMessageType = "worker_offer" | "client_request" | "irrelevant";

export type ClassifiedMessage = {
  type: ExternalMessageType;
  phone: string | null;
  name: string | null;
  category: string;
  services: string[];
  city: string | null;
  price_min_cents: number | null;
  price_max_cents: number | null;
  summary: string;
  tags: string[];
  urgency: "low" | "medium" | "high";
};

const SYSTEM = `Siz Telegram kanal va OLX e'lonlarini tahlil qiladigan AI yordamchisiz.

Har bir xabarni quyidagilardan biriga ajrating:
- "worker_offer": usta yoki xizmat ko'rsatuvchi shaxs o'z xizmatini taklif qilmoqda
  Misol: "Santexnik xizmat ko'rsataman", "Elektrik ishlarni bajaramiz", "Remont brigadasi"
- "client_request": kimdir usta yoki xizmat izlamoqda
  Misol: "Santexnik kerak", "Elektrik topishim kerak", "Kim remont qiladi"
- "irrelevant": boshqa mavzu (yangiliklar, savdo tovarlari, ovqat, siyosat, reklama)

Xabardan quyidagilarni ajrating:
- phone: O'zbek raqam (+998...). Standart: +998XXXXXXXXX. Topilmasa null.
- name: Usta yoki mijozning ismi/kompaniya nomi. Topilmasa null.
- category: Asosiy yo'nalish: Santex, Elektr, Ta'mir, Qurilish, Bo'yoq, Konditsioner, Qulfchilik, Yuk tashish, Boshqa
- services: Konkret xizmatlar massivi (maks 8 ta)
- city: Shahar/tuman nomi. Topilmasa null.
- price_min_cents: Minimum narx so'mda (butun son). null agar ko'rsatilmagan.
- price_max_cents: Maksimum narx so'mda. null agar ko'rsatilmagan.
- summary: 1-2 jumlali qisqa tavsif (o'zbek tilida)
- tags: 5-8 ta kalit so'z massivi
- urgency: "low"|"medium"|"high" — zudlik darajasi (worker_offer uchun doim "low")

Faqat JSON qaytaring:
{"type":"...","phone":"...","name":"...","category":"...","services":[...],"city":"...","price_min_cents":null,"price_max_cents":null,"summary":"...","tags":[...],"urgency":"medium"}`;

export function normalizeUzbekPhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-\(\)\+]/g, "");
  if (/^998\d{9}$/.test(digits)) return `+${digits}`;
  if (/^9\d{8}$/.test(digits)) return `+998${digits}`;
  return null;
}

function extractPhoneFromText(text: string): string | null {
  const m = text.match(/\+?998[\s\-]?\d{2}[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/);
  if (m) return normalizeUzbekPhone(m[0]);
  const m2 = text.match(/\b9\d{8}\b/);
  if (m2) return normalizeUzbekPhone(m2[0]);
  return null;
}

function parseResult(raw: string): ClassifiedMessage {
  let p: Record<string, unknown> = {};
  try {
    p = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    /* ignore */
  }

  const type: ExternalMessageType = (["worker_offer", "client_request", "irrelevant"] as const).includes(
    p.type as ExternalMessageType
  )
    ? (p.type as ExternalMessageType)
    : "irrelevant";

  const rawPhone = typeof p.phone === "string" ? p.phone.trim() : null;
  const phone = rawPhone ? normalizeUzbekPhone(rawPhone) : null;
  const name =
    typeof p.name === "string" && p.name.trim() ? p.name.trim().slice(0, 160) : null;
  const category =
    typeof p.category === "string" && p.category.trim()
      ? p.category.trim().slice(0, 120)
      : "Xizmat";
  const services = Array.isArray(p.services)
    ? (p.services as unknown[]).slice(0, 10).map((s) => String(s).slice(0, 80))
    : [];
  const city =
    typeof p.city === "string" && p.city.trim() ? p.city.trim().slice(0, 120) : null;
  const price_min_cents =
    typeof p.price_min_cents === "number" && p.price_min_cents > 0
      ? Math.round(p.price_min_cents)
      : null;
  const price_max_cents =
    typeof p.price_max_cents === "number" && p.price_max_cents > 0
      ? Math.round(p.price_max_cents)
      : null;
  const summary =
    typeof p.summary === "string" ? p.summary.trim().slice(0, 500) : "";
  const tags = Array.isArray(p.tags)
    ? (p.tags as unknown[]).slice(0, 10).map((t) => String(t).slice(0, 40))
    : [];
  const urgency: "low" | "medium" | "high" = (["low", "medium", "high"] as const).includes(
    p.urgency as "low" | "medium" | "high"
  )
    ? (p.urgency as "low" | "medium" | "high")
    : "medium";

  return { type, phone, name, category, services, city, price_min_cents, price_max_cents, summary, tags, urgency };
}

function fallbackClassify(text: string): ClassifiedMessage {
  const lower = text.toLowerCase();
  const isWorker =
    /xizmat ko[`'']rsataman|bajaramiz|usta[\s:,]|master[\s:,]|remont qilamiz|ishlaymiz|xizmat taklif/i.test(
      lower
    );
  const isClient =
    /kerak|izlayman|kim qiladi|yordam kerak|topishim kerak|qidiryapman/i.test(lower);

  return {
    type: isWorker ? "worker_offer" : isClient ? "client_request" : "irrelevant",
    phone: extractPhoneFromText(text),
    name: null,
    category: "Xizmat",
    services: [],
    city: null,
    price_min_cents: null,
    price_max_cents: null,
    summary: text.slice(0, 200),
    tags: [],
    urgency: "medium",
  };
}

export async function classifyExternalMessage(text: string): Promise<ClassifiedMessage> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return fallbackClassify(text);

  try {
    const client = new OpenAI({ apiKey: key });
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.15,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: text.slice(0, 3000) },
      ],
    });
    return parseResult(completion.choices[0]?.message?.content ?? "{}");
  } catch {
    return fallbackClassify(text);
  }
}
