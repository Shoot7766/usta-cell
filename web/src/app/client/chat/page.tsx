"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { loadWebApp } from "@/lib/twa";
import { getBestEffortLatLng } from "@/lib/geo";
import { FALLBACK_REGION_LAT, FALLBACK_REGION_LNG } from "@/lib/worker-defaults";
import { apiJson, apiForm } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TwaShell } from "@/components/telegram/TwaShell";
import { motion, AnimatePresence } from "framer-motion";
import { hapticSuccess } from "@/lib/haptic";

const MiniMapPicker = dynamic(
  () => import("@/components/map/MiniMapPicker").then((m) => ({ default: m.MiniMapPicker })),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[200px] rounded-xl bg-white/5 border border-white/10 animate-pulse" />
    ),
  }
);

type ThreadMsg = { role: "user" | "assistant"; content: string };

type DraftRequest = {
  id: string;
  conversation: ThreadMsg[];
  structured: Record<string, unknown> | null;
  summary: string | null;
  category: string | null;
  urgency: string | null;
  tags: string[] | null;
  address: string | null;
  client_lat?: number | null;
  client_lng?: number | null;
};

type AiRes = {
  requestId: string;
  usedOpenAi: boolean;
  readyToMatch?: boolean;
  ai: {
    category: string;
    urgency: string;
    questions: string[];
    summary: string;
    tags: string[];
  };
};

const DRAFT_STORAGE = "usta_chat_draft_id";

function draftToAi(d: DraftRequest): AiRes["ai"] | null {
  const st = (d.structured || {}) as {
    tags?: string[];
    questions?: string[];
    urgency?: string;
  };
  if (!String(d.summary ?? "").trim() && !String(d.category ?? "").trim()) return null;
  return {
    category: d.category || "Xizmat",
    urgency: (d.urgency as string) || st.urgency || "medium",
    questions: Array.isArray(st.questions) ? st.questions : [],
    summary: d.summary || "",
    tags:
      Array.isArray(d.tags) && d.tags.length > 0 ? d.tags : Array.isArray(st.tags) ? st.tags : [],
  };
}

function displayUserLine(content: string): string {
  if (content.includes("[Rasm yuborildi]")) {
    const t = content.replace(/\n*\[Rasm yuborildi\]\n*/g, "").trim();
    return t ? `${t}\n📷 Rasm` : "📷 Rasm";
  }
  return content;
}

export default function ClientChatPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadMsg[]>([]);
  const [lastAi, setLastAi] = useState<AiRes["ai"] | null>(null);
  const [usedOpenAi, setUsedOpenAi] = useState<boolean | null>(null);
  const [readyToMatch, setReadyToMatch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(true);
  const [locLoading, setLocLoading] = useState(false);
  const [pickLat, setPickLat] = useState(FALLBACK_REGION_LAT);
  const [pickLng, setPickLng] = useState(FALLBACK_REGION_LNG);
  const [addressLine, setAddressLine] = useState("");
  const [pendingImagePath, setPendingImagePath] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileImgRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const applyDraft = (d: DraftRequest) => {
    setRequestId(d.id);
    setThread(Array.isArray(d.conversation) ? d.conversation : []);
    const ai = draftToAi(d);
    if (ai) {
      setLastAi(ai);
      setReadyToMatch(ai.questions.length === 0);
    } else {
      setLastAi(null);
      setReadyToMatch(false);
    }
    if (d.address?.trim()) {
      setAddressLine((prev) => prev || d.address!.split(" · ")[0]!.slice(0, 420));
    }
    if (
      typeof d.client_lat === "number" &&
      typeof d.client_lng === "number" &&
      Number.isFinite(d.client_lat) &&
      Number.isFinite(d.client_lng)
    ) {
      setPickLat(d.client_lat);
      setPickLng(d.client_lng);
    }
    try {
      sessionStorage.setItem(DRAFT_STORAGE, d.id);
    } catch {
      /* */
    }
  };

  const loadDraft = async (expectedId?: string | null) => {
    const r = await apiJson<{ request: DraftRequest | null }>("/api/requests/draft");
    if (!r.ok || !r.data?.request) {
      if (!expectedId) {
        setRequestId(null);
        setThread([]);
        setLastAi(null);
      }
      return;
    }
    const d = r.data.request;
    if (expectedId && d.id !== expectedId) return;
    applyDraft(d);
  };

  useEffect(() => {
    void loadWebApp().then((WebApp) => {
      WebApp.BackButton.hide();
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setHydrating(true);
      await loadDraft(null);
      if (!cancelled) setHydrating(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- faqat mount
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread, lastAi, loading, pendingImagePath, hydrating]);

  const uploadImageFile = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const r = await apiForm<{ path: string }>("/api/media/chat-image", fd);
    if (r.ok && r.data?.path) {
      setPendingImagePath(r.data.path);
    } else if (r.error) {
      window.alert(r.error);
    }
  };

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void uploadImageFile(f);
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") mr.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  };

  const startRecording = async () => {
    if (recording) {
      stopRecording();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime =
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || mime });
        chunksRef.current = [];
        const fd = new FormData();
        const ext = blob.type.includes("webm") ? "webm" : "m4a";
        fd.append("file", blob, `voice.${ext}`);
        const r = await apiForm<{ text: string }>("/api/ai/transcribe", fd);
        if (r.ok && r.data?.text) {
          setText((prev) => {
            const t = r.data!.text.trim();
            if (!t) return prev;
            return prev ? `${prev.trim()} ${t}` : t;
          });
        } else if (r.error) {
          window.alert(r.error);
        }
      };
      mr.start(200);
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch {
      window.alert("Mikrofonga ruxsat berilmadi yoki qo‘llab-quvvatlanmaydi.");
    }
  };

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed && !pendingImagePath) return;
    setLoading(true);
    const r = await apiJson<AiRes>("/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({
        requestId: requestId ?? undefined,
        message: trimmed || undefined,
        imagePath: pendingImagePath ?? undefined,
      }),
    });
    setLoading(false);
    if (r.ok && r.data) {
      const rid = r.data.requestId;
      setRequestId(rid);
      setLastAi(r.data.ai);
      setUsedOpenAi(r.data.usedOpenAi);
      setReadyToMatch(Boolean(r.data.readyToMatch));
      setText("");
      setPendingImagePath(null);
      await loadDraft(rid);
    }
  };

  const submitReq = async () => {
    if (!requestId) return;
    setLoading(true);
    const r = await apiJson(`/api/requests/${requestId}/submit`, { method: "POST" });
    setLoading(false);
    if (r.ok) {
      hapticSuccess();
      router.push(`/client/workers?requestId=${requestId}`);
    }
  };

  /** Draft bo‘lsa ham ustalar ro‘yxati ochiladi (reyting va mos xizmat bo‘yicha). */
  const quickToWorkers = () => {
    if (!requestId) return;
    router.push(`/client/workers?requestId=${requestId}`);
  };

  const applyGpsToMap = async () => {
    setLocLoading(true);
    const g = await getBestEffortLatLng();
    setLocLoading(false);
    if (g) {
      setPickLat(g.lat);
      setPickLng(g.lng);
    } else {
      window.alert("Joylashuv olinmadi. Xaritadan nuqtani bosing yoki belgini suring.");
    }
  };

  const saveLoc = async () => {
    if (!requestId) return;
    setLocLoading(true);
    const lat = pickLat;
    const lng = pickLng;
    const manual = addressLine.trim();
    const address = manual
      ? `${manual.slice(0, 420)} · ${lat.toFixed(5)}, ${lng.toFixed(5)}`.slice(0, 500)
      : `${lat.toFixed(5)}, ${lng.toFixed(5)} — xarita`;
    await apiJson(`/api/requests/${requestId}/location`, {
      method: "PATCH",
      body: JSON.stringify({
        lat,
        lng,
        address,
      }),
    });
    setLocLoading(false);
    await loadDraft(requestId);
  };

  return (
    <div className="min-h-dvh flex flex-col px-4 pt-4">
      <TwaShell />
      <header className="mb-3">
        <h1 className="text-lg font-bold gradient-text">Dispetcher AI</h1>
        <p className="text-xs text-white/50">
          Muammoingizni yozing — mos santex/elektr ustalar reyting bo‘yicha chiqadi. Suhbat
          saqlanadi.
        </p>
        {usedOpenAi !== null && (
          <p
            className={`text-[10px] mt-1 ${usedOpenAi ? "text-emerald-400/80" : "text-amber-300/80"}`}
          >
            {usedOpenAi
              ? "OpenAI (gpt-4o-mini) ishlatilmoqda."
              : "OpenAI kaliti yo‘q — cheklangan rejim."}
          </p>
        )}
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 pb-4">
        {hydrating && (
          <p className="text-xs text-white/40">Suhbat yuklanmoqda…</p>
        )}
        <AnimatePresence>
          {thread
            .filter((m) => m.role === "user")
            .map((m, i) => (
              <motion.div
                key={`${i}-${m.content.slice(0, 32)}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-end"
              >
                <div className="max-w-[92%] rounded-2xl px-3 py-2 text-sm bg-cyan-500/20 border border-cyan-400/25 text-white/95">
                  <p className="whitespace-pre-wrap break-words">{displayUserLine(m.content)}</p>
                </div>
              </motion.div>
            ))}
        </AnimatePresence>
        {lastAi && (
          <motion.div
            key="summary-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <GlassCard className="p-4 space-y-2" glow>
              <p className="text-[11px] uppercase tracking-wider text-white/40">
                {lastAi.category} · {lastAi.urgency}
              </p>
              <p className="text-sm text-white/90">{lastAi.summary}</p>
              {lastAi.questions?.length > 0 && (
                <ul className="text-xs text-cyan-200/90 list-disc pl-4 space-y-1">
                  {lastAi.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              )}
              {readyToMatch && lastAi.questions.length === 0 && requestId && (
                <div className="flex flex-col gap-2 pt-1">
                  <PrimaryButton className="!py-2 !text-xs w-full" onClick={quickToWorkers}>
                    Ustalarni ko‘rish (reyting bo‘yicha)
                  </PrimaryButton>
                  <p className="text-[10px] text-white/35 text-center">
                    Yoki avval manzilni tasdiqlang, keyin «So‘rovni tasdiqlash».
                  </p>
                </div>
              )}
              <div className="flex flex-wrap gap-1 pt-1">
                {lastAi.tags.map((t) => (
                  <span
                    key={t}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </GlassCard>
          </motion.div>
        )}
        <div ref={endRef} />
      </div>

      <GlassCard className="p-3 mb-3 space-y-2">
        <input
          ref={fileImgRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={onPickImage}
        />
        {pendingImagePath && (
          <p className="text-[11px] text-cyan-300/90">
            Rasm tanlandi — yuborishda AI ko‘radi.{" "}
            <button
              type="button"
              className="underline text-white/70"
              onClick={() => setPendingImagePath(null)}
            >
              Bekor
            </button>
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-xs shrink-0"
            onClick={() => fileImgRef.current?.click()}
          >
            Rasm
          </button>
          <button
            type="button"
            className={`rounded-xl border px-3 py-2 text-xs shrink-0 ${
              recording
                ? "bg-red-500/25 border-red-400/50 text-red-200"
                : "bg-white/10 border-white/15"
            }`}
            onClick={() => void (recording ? stopRecording() : startRecording())}
          >
            {recording ? "To‘xtatish" : "Ovoz"}
          </button>
        </div>
        <textarea
          className="w-full min-h-[88px] rounded-xl bg-black/35 border border-white/10 px-3 py-2 text-sm outline-none focus:border-cyan-400/40 resize-none"
          placeholder="Masalan: Kanalizatsiya oqmayapti, yordam kerak…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex gap-2">
          <PrimaryButton
            className="flex-1"
            disabled={loading || hydrating || (!text.trim() && !pendingImagePath)}
            onClick={send}
          >
            {loading ? "Kutilmoqda…" : "Yuborish"}
          </PrimaryButton>
        </div>
        {requestId && (
          <div className="space-y-2 pt-1">
            <p className="text-[11px] text-white/40">
              Manzil va nuqta (OpenStreetMap — bosing yoki belgini suring)
            </p>
            <MiniMapPicker
              lat={pickLat}
              lng={pickLng}
              onChange={(la, ln) => {
                setPickLat(la);
                setPickLng(ln);
              }}
            />
            <p className="text-[10px] text-white/35 font-mono">
              {pickLat.toFixed(5)}, {pickLng.toFixed(5)}
            </p>
            <input
              className="w-full rounded-xl bg-black/35 border border-white/10 px-3 py-2 text-sm outline-none focus:border-cyan-400/40"
              placeholder="Masalan: Yunusobod, Amir Temur ko‘chasi 12-uy, 45-xonadon"
              value={addressLine}
              onChange={(e) => setAddressLine(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={locLoading}
                className="rounded-xl bg-white/5 border border-white/10 py-2 text-xs disabled:opacity-50"
                onClick={() => void applyGpsToMap()}
              >
                {locLoading ? "…" : "GPS → xarita"}
              </button>
              <button
                type="button"
                disabled={locLoading}
                className="rounded-xl bg-white/5 border border-white/10 py-2 text-xs disabled:opacity-50"
                onClick={() => void saveLoc()}
              >
                {locLoading ? "Saqlanmoqda…" : "Manzilni saqlash"}
              </button>
            </div>
            <PrimaryButton className="!py-2 !text-xs w-full" onClick={submitReq}>
              So‘rovni tasdiqlash
            </PrimaryButton>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
