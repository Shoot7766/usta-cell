import { getServiceSupabase } from "@/lib/supabase/admin";
import { classifyExternalMessage, normalizeUzbekPhone, type ClassifiedMessage } from "@/lib/openai/classifier";

/* ─── Types ─────────────────────────────────────────────────────────────── */

export type ExternalImportInput = {
  provider: string;
  providerLabel?: string;
  sourceUrl?: string;
  messageText: string;
  contactName?: string;
  contactPhone?: string;
  contactHandle?: string;
  externalChatId?: string;
  externalMessageId?: string;
  dedupeKey?: string;
  address?: string;
  lat?: number;
  lng?: number;
  rawPayload?: Record<string, unknown>;
};

export type ImportResult = {
  type: "worker_offer" | "client_request" | "irrelevant" | "duplicate" | "error";
  id: string | null;
  created: boolean;
  notified: boolean;
  phone: string | null;
  summary: string;
};

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function cleanOptional(v: string | undefined | null, max: number): string | null {
  if (!v || typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t.slice(0, max) : null;
}

/** Stable synthetic telegram_id derived from phone number.
 *  +998XXXXXXXXX → -998XXXXXXXXX  (negative, unique per phone, safe bigint range)
 */
function phoneToSyntheticTgId(phone: string): number {
  const digits = phone.replace(/\D/g, "");
  return -Number(digits);
}

/** Stable synthetic telegram_id derived from a deduplication key string (djb2).
 *  Used when no phone is available. Range: -600000000001 to -699999999999
 */
function dedupeKeyToSyntheticTgId(key: string): number {
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
  }
  return -(600000000001 + (h % 99999999998));
}

function buildDedupeKey(input: ExternalImportInput): string {
  if (input.dedupeKey) return input.dedupeKey;
  const parts = [
    (input.provider || "ext").slice(0, 20),
    input.externalChatId || "",
    input.externalMessageId || "",
    (input.messageText || "").slice(0, 120),
  ];
  return parts.join("|");
}

/** Find an existing user (real or synthetic) by phone. Returns their DB id. */
async function findUserByPhone(
  phone: string
): Promise<{ id: string; realTgId: boolean } | null> {
  const sb = getServiceSupabase();
  const { data } = await sb
    .from("users")
    .select("id, telegram_id")
    .eq("phone", phone)
    .order("telegram_id", { ascending: false }) // real (positive) first
    .limit(1)
    .maybeSingle();
  if (!data?.id) return null;
  const tgId = Number(data.telegram_id ?? 0);
  return { id: data.id as string, realTgId: tgId > 0 };
}

/** Get or create a synthetic user for the given phone + role. */
async function ensureUserByPhone(
  phone: string,
  role: "worker" | "client",
  displayName: string | null
): Promise<{ id: string; realTgId: boolean }> {
  const found = await findUserByPhone(phone);
  if (found) return found;

  const sb = getServiceSupabase();
  const synTgId = phoneToSyntheticTgId(phone);
  const { data: existing } = await sb
    .from("users")
    .select("id")
    .eq("telegram_id", synTgId)
    .maybeSingle();
  if (existing?.id) return { id: existing.id as string, realTgId: false };

  const { data: inserted } = await sb
    .from("users")
    .insert({
      telegram_id: synTgId,
      phone,
      role,
      display_name: displayName,
      profile_completed: false,
      locale: "uz",
      onboarding_step: "external_import",
    })
    .select("id")
    .single();

  return { id: inserted!.id as string, realTgId: false };
}

/** Shared synthetic client for requests without a known phone. */
async function ensureSharedExternalClient(): Promise<string> {
  const SHARED_TG_ID = -900000000001;
  const sb = getServiceSupabase();
  const { data: existing } = await sb
    .from("users")
    .select("id")
    .eq("telegram_id", SHARED_TG_ID)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data } = await sb
    .from("users")
    .insert({
      telegram_id: SHARED_TG_ID,
      role: "client",
      display_name: "External import",
      profile_completed: false,
      locale: "uz",
      onboarding_step: "external_import",
    })
    .select("id")
    .single();
  return data!.id as string;
}

/** Unique synthetic telegram_id for a worker without a phone (from dedupeKey). */
async function ensureWorkerByDedupeKey(
  dedupeKey: string,
  displayName: string | null
): Promise<string> {
  const sb = getServiceSupabase();
  const synTgId = dedupeKeyToSyntheticTgId(dedupeKey);

  const { data: existing } = await sb
    .from("users")
    .select("id")
    .eq("telegram_id", synTgId)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data } = await sb
    .from("users")
    .insert({
      telegram_id: synTgId,
      role: "worker",
      display_name: displayName,
      profile_completed: false,
      locale: "uz",
      onboarding_step: "external_import",
    })
    .select("id")
    .single();
  return data!.id as string;
}

/** Send a Telegram bot message to a real user identified by their telegram_id. */
async function sendBotMessage(telegramId: number, text: string): Promise<boolean> {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token || telegramId <= 0) return false;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: telegramId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      }
    );
    const json = (await res.json()) as { ok?: boolean };
    return json.ok === true;
  } catch {
    return false;
  }
}

/** Try to find a real Telegram user by phone and notify them. */
async function tryNotifyByPhone(phone: string, text: string): Promise<boolean> {
  const sb = getServiceSupabase();
  const { data } = await sb
    .from("users")
    .select("telegram_id")
    .eq("phone", phone)
    .gt("telegram_id", 0) // only real users
    .maybeSingle();
  const tgId = Number(data?.telegram_id ?? 0);
  if (!tgId) return false;
  return sendBotMessage(tgId, text);
}

/** Notify the admin channel about a new external lead (optional). */
async function notifyAdmin(text: string): Promise<void> {
  const chatIdRaw = (process.env.TELEGRAM_ADMIN_CHAT_ID || "").trim();
  if (!chatIdRaw) return;
  const chatId = Number(chatIdRaw);
  if (!chatId) return;
  await sendBotMessage(chatId, text);
}

/* ─── Worker import ─────────────────────────────────────────────────────── */

async function importExternalWorker(
  input: ExternalImportInput,
  classified: ClassifiedMessage
): Promise<ImportResult> {
  const sb = getServiceSupabase();
  const dedupeKey = buildDedupeKey(input);
  const phone =
    classified.phone ||
    (input.contactPhone ? normalizeUzbekPhone(input.contactPhone) : null);
  const displayName =
    classified.name || cleanOptional(input.contactName, 160) || "Usta (tashqi e'lon)";

  // Check existing worker_profile by dedupeKey
  const { data: existingProfile } = await sb
    .from("worker_profiles")
    .select("user_id")
    .eq("external_dedupe_key", dedupeKey)
    .maybeSingle();

  const profilePatch = {
    services: classified.services.length > 0 ? classified.services : [classified.category],
    city_name: classified.city,
    price_min_cents: classified.price_min_cents ?? 0,
    price_max_cents: classified.price_max_cents ?? 0,
    source: (input.provider || "external").slice(0, 40),
    source_url: cleanOptional(input.sourceUrl, 2048),
    external_phone: phone,
    external_handle:
      cleanOptional(input.contactHandle, 120) ||
      (phone ? phone : null),
    external_dedupe_key: dedupeKey,
    import_meta:
      input.rawPayload && typeof input.rawPayload === "object"
        ? input.rawPayload
        : {},
  };

  if (existingProfile?.user_id) {
    await sb
      .from("worker_profiles")
      .update(profilePatch)
      .eq("user_id", existingProfile.user_id as string);

    // Also update user display_name if changed
    if (displayName) {
      await sb
        .from("users")
        .update({ display_name: displayName, phone: phone || undefined })
        .eq("id", existingProfile.user_id as string);
    }

    return {
      type: "worker_offer",
      id: existingProfile.user_id as string,
      created: false,
      notified: false,
      phone,
      summary: classified.summary || input.messageText.slice(0, 200),
    };
  }

  // Create new worker user
  const userId = phone
    ? (await ensureUserByPhone(phone, "worker", displayName)).id
    : await ensureWorkerByDedupeKey(dedupeKey, displayName);

  // Check if this user already has a worker_profile
  const { data: existingProfileForUser } = await sb
    .from("worker_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingProfileForUser?.user_id) {
    // Update their existing profile with external metadata
    const { error: upErr } = await sb
      .from("worker_profiles")
      .update(profilePatch)
      .eq("user_id", userId);
    if (upErr) throw new Error(`worker_profiles update: ${upErr.message}`);
  } else {
    // Insert new worker_profile
    const { error: insErr } = await sb.from("worker_profiles").insert({
      user_id: userId,
      ...profilePatch,
      is_available: true,
    });
    if (insErr) throw new Error(`worker_profiles insert: ${insErr.message}`);
  }

  // Notify if real user exists with this phone
  let notified = false;
  if (phone) {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
    const notifyText =
      `✅ <b>Usta Call:</b> Sizning e'loningiz (${input.providerLabel || input.provider}) ` +
      `platformamizda <b>usta profili</b> sifatida qo'shildi.\n\n` +
      `Profilingizni to'ldirish va buyurtmalar olish uchun:\n${appUrl}`;
    notified = await tryNotifyByPhone(phone, notifyText);
  }

  const summary = classified.summary || input.messageText.slice(0, 200);

  await notifyAdmin(
    `🔨 <b>Yangi usta (tashqi e'lon)</b>\n` +
      `Manba: ${input.providerLabel || input.provider}\n` +
      `Ism: ${displayName}\n` +
      `Telefon: ${phone || "—"}\n` +
      `Xizmat: ${classified.category}\n` +
      `Shahar: ${classified.city || "—"}\n` +
      `Xabardor: ${notified ? "ha" : "yo'q"}`
  );

  return { type: "worker_offer", id: userId, created: true, notified, phone, summary };
}

/* ─── Client request import ─────────────────────────────────────────────── */

async function importExternalClient(
  input: ExternalImportInput,
  classified: ClassifiedMessage
): Promise<ImportResult> {
  const sb = getServiceSupabase();
  const dedupeKey = buildDedupeKey(input);
  const phone =
    classified.phone ||
    (input.contactPhone ? normalizeUzbekPhone(input.contactPhone) : null);
  const displayName =
    classified.name || cleanOptional(input.contactName, 160) || null;

  // Check existing request by dedupeKey
  const { data: existingReq } = await sb
    .from("requests")
    .select("id")
    .eq("external_dedupe_key", dedupeKey)
    .maybeSingle();

  const text = input.messageText.slice(0, 4000);
  const summary = classified.summary || text.slice(0, 200);

  const requestPatch = {
    status: "submitted",
    summary: summary.slice(0, 500),
    category: classified.category.slice(0, 120),
    urgency: classified.urgency,
    tags: classified.tags,
    price_min_cents: classified.price_min_cents ?? null,
    price_max_cents: classified.price_max_cents ?? null,
    address: cleanOptional(input.address, 240),
    client_lat: typeof input.lat === "number" ? input.lat : null,
    client_lng: typeof input.lng === "number" ? input.lng : null,
    conversation: [
      { role: "user", content: text },
      { role: "assistant", content: summary },
    ],
    structured: {
      category: classified.category,
      urgency: classified.urgency,
      tags: classified.tags,
      imported_from_external: true,
    },
    imported_from_external: true,
    source_provider: (input.provider || "external").slice(0, 40),
    source_label: cleanOptional(input.providerLabel, 120),
    source_url: cleanOptional(input.sourceUrl, 2048),
    external_contact_name: displayName,
    external_contact_phone: phone,
    external_contact_handle: cleanOptional(input.contactHandle, 120),
    external_chat_id: cleanOptional(input.externalChatId, 120),
    external_message_id: cleanOptional(input.externalMessageId, 120),
    external_dedupe_key: dedupeKey,
    import_meta:
      input.rawPayload && typeof input.rawPayload === "object"
        ? input.rawPayload
        : {},
  };

  if (existingReq?.id) {
    await sb
      .from("requests")
      .update(requestPatch)
      .eq("id", existingReq.id as string);
    return {
      type: "client_request",
      id: existingReq.id as string,
      created: false,
      notified: false,
      phone,
      summary,
    };
  }

  // Create client user
  const clientId = phone
    ? (await ensureUserByPhone(phone, "client", displayName)).id
    : await ensureSharedExternalClient();

  // Update user display_name if we have one and they're synthetic
  if (phone && displayName) {
    await sb
      .from("users")
      .update({ display_name: displayName })
      .eq("phone", phone)
      .lt("telegram_id", 0); // only synthetic users
  }

  const { data: inserted, error: reqInsErr } = await sb
    .from("requests")
    .insert({ client_id: clientId, created_at: new Date().toISOString(), ...requestPatch })
    .select("id")
    .single();

  if (reqInsErr || !inserted?.id) {
    throw new Error(`Tashqi so'rov saqlanmadi: ${reqInsErr?.message ?? "unknown"}`);
  }

  // Notify if real user with this phone is already in our system
  let notified = false;
  if (phone) {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
    const notifyText =
      `✅ <b>Usta Call:</b> Sizning so'rovingiz (${input.providerLabel || input.provider}) ` +
      `platformamizda <b>e'lon</b> sifatida qo'shildi.\n\n` +
      `Ustalarni ko'rish uchun:\n${appUrl}`;
    notified = await tryNotifyByPhone(phone, notifyText);
  }

  await notifyAdmin(
    `📋 <b>Yangi mijoz so'rovi (tashqi e'lon)</b>\n` +
      `Manba: ${input.providerLabel || input.provider}\n` +
      `Ism: ${displayName || "—"}\n` +
      `Telefon: ${phone || "—"}\n` +
      `Xizmat: ${classified.category}\n` +
      `Shahar: ${classified.city || "—"}\n` +
      `Xabardor: ${notified ? "ha" : "yo'q"}`
  );

  return {
    type: "client_request",
    id: inserted.id as string,
    created: true,
    notified,
    phone,
    summary,
  };
}

/* ─── Main entry point ──────────────────────────────────────────────────── */

/** Classify the message and route to worker or client import. */
export async function importFromExternal(
  input: ExternalImportInput
): Promise<ImportResult> {
  const text = (input.messageText || "").trim();
  if (text.length < 5) {
    return { type: "irrelevant", id: null, created: false, notified: false, phone: null, summary: "" };
  }

  let classified: ClassifiedMessage;
  try {
    classified = await classifyExternalMessage(text);
  } catch {
    return { type: "error", id: null, created: false, notified: false, phone: null, summary: "" };
  }

  if (classified.type === "irrelevant") {
    return { type: "irrelevant", id: null, created: false, notified: false, phone: null, summary: "" };
  }

  try {
    if (classified.type === "worker_offer") {
      return await importExternalWorker(input, classified);
    }
    return await importExternalClient(input, classified);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[external-import] import failed:", msg);
    return { type: "error", id: null, created: false, notified: false, phone: null, summary: msg };
  }
}

/** Called from webhook when a user shares their phone contact.
 *  Links any pending synthetic profiles to their real Telegram account
 *  and notifies them if profiles exist.
 */
export async function linkProfilesByPhone(
  phone: string,
  realTelegramId: number,
  displayName: string | null,
  username: string | null
): Promise<{ workerLinked: boolean; clientLinked: boolean }> {
  if (!phone || realTelegramId <= 0) return { workerLinked: false, clientLinked: false };
  const normPhone = normalizeUzbekPhone(phone);
  if (!normPhone) return { workerLinked: false, clientLinked: false };

  const sb = getServiceSupabase();

  // Find any synthetic user with this phone
  const { data: synUser } = await sb
    .from("users")
    .select("id, role")
    .eq("phone", normPhone)
    .lt("telegram_id", 0) // synthetic
    .limit(1)
    .maybeSingle();

  if (!synUser?.id) return { workerLinked: false, clientLinked: false };

  // Check if a real user with this telegram_id already exists
  const { data: realUser } = await sb
    .from("users")
    .select("id")
    .eq("telegram_id", realTelegramId)
    .maybeSingle();

  const role = synUser.role as string;

  if (realUser?.id) {
    // Merge: transfer any worker_profile or requests to real user
    if (role === "worker") {
      await sb
        .from("worker_profiles")
        .update({ user_id: realUser.id as string })
        .eq("user_id", synUser.id as string);
    } else {
      await sb
        .from("requests")
        .update({ client_id: realUser.id as string })
        .eq("client_id", synUser.id as string);
    }
    // Remove synthetic user
    await sb.from("users").delete().eq("id", synUser.id as string);
  } else {
    // Upgrade synthetic user to real
    await sb
      .from("users")
      .update({
        telegram_id: realTelegramId,
        display_name: displayName,
        username,
        profile_completed: false,
        onboarding_step: "start",
      })
      .eq("id", synUser.id as string);
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim();

  if (role === "worker") {
    await sendBotMessage(
      realTelegramId,
      `✅ <b>Usta Call:</b> Telefon raqamingiz bo'yicha <b>usta profili</b> topildi va hisobingizga ulandi!\n\nProfilingizni to'ldirish uchun:\n${appUrl}`
    );
    return { workerLinked: true, clientLinked: false };
  }

  await sendBotMessage(
    realTelegramId,
    `✅ <b>Usta Call:</b> Telefon raqamingiz bo'yicha <b>e'loningiz</b> topildi va hisobingizga ulandi!\n\nUstalarni ko'rish uchun:\n${appUrl}`
  );
  return { workerLinked: false, clientLinked: true };
}
