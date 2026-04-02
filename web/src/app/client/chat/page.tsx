"use client";

import { useEffect, useRef, useState } from "react";
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

export default function ClientChatPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [lastAi, setLastAi] = useState<AiRes["ai"] | null>(null);
  const [usedOpenAi, setUsedOpenAi] = useState<boolean | null>(null);
  const [readyToMatch, setReadyToMatch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const [addressLine, setAddressLine] = useState("");
  const [pendingImagePath, setPendingImagePath] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileImgRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    void loadWebApp().then((WebApp) => {
      WebApp.BackButton.hide();
    });
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lastAi, loading, pendingImagePath]);

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
      setRequestId(r.data.requestId);
      setLastAi(r.data.ai);
      setUsedOpenAi(r.data.usedOpenAi);
      setReadyToMatch(Boolean(r.data.readyToMatch));
      setText("");
      setPendingImagePath(null);
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

  const quickToWorkers = async () => {
    await submitReq();
  };

  const saveLoc = async () => {
    if (!requestId) return;
    setLocLoading(true);
    const g = await getBestEffortLatLng();
    setLocLoading(false);
    const lat = g?.lat ?? FALLBACK_REGION_LAT;
    const lng = g?.lng ?? FALLBACK_REGION_LNG;
    const manual = addressLine.trim();
    const address = manual
      ? `${manual.slice(0, 420)}${g ? " · GPS" : " · Zaxira nuqta"}`.slice(0, 500)
      : g
        ? "GPS / Telegram joylashuvi"
        : "Toshkent (zaxira)";
    await apiJson(`/api/requests/${requestId}/location`, {
      method: "PATCH",
      body: JSON.stringify({
        lat,
        lng,
        address,
      }),
    });
  };

  return (
    <div className="min-h-dvh flex flex-col px-4 pt-4">
      <TwaShell />
      <header className="mb-3">
        <h1 className="text-lg font-bold gradient-text">Dispetcher AI</h1>
        <p className="text-xs text-white/50">
          Matn, rasm yoki ovoz — tizim tezda kategoriya va ustalar uchun ma’lumot ajratadi.
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
        <AnimatePresence>
          {lastAi && (
            <motion.div
              key="card"
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
                  <PrimaryButton
                    className="!py-2 !text-xs w-full mt-2"
                    onClick={() => void quickToWorkers()}
                  >
                    Ustalarni ko‘rish (tezkor)
                  </PrimaryButton>
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
        </AnimatePresence>
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
          placeholder="Masalan: Oshxonamda rozetka isitadi, shoshilinch…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex gap-2">
          <PrimaryButton
            className="flex-1"
            disabled={loading || (!text.trim() && !pendingImagePath)}
            onClick={send}
          >
            {loading ? "Kutilmoqda…" : "Yuborish"}
          </PrimaryButton>
        </div>
        {requestId && (
          <div className="space-y-2 pt-1">
            <p className="text-[11px] text-white/40">Manzil (ixtiyoriy, usta topish uchun)</p>
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
                onClick={() => void saveLoc()}
              >
                {locLoading ? "Joylashuv…" : "Joylashuvni ulash"}
              </button>
              <PrimaryButton className="!py-2 !text-xs" onClick={submitReq}>
                So‘rovni tasdiqlash
              </PrimaryButton>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
