"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadWebApp } from "@/lib/twa";
import { apiJson } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TwaShell } from "@/components/telegram/TwaShell";
import { motion, AnimatePresence } from "framer-motion";
import { hapticSuccess } from "@/lib/haptic";

type AiRes = {
  requestId: string;
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
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadWebApp().then((WebApp) => {
      WebApp.BackButton.hide();
    });
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lastAi, loading]);

  const send = async () => {
    if (!text.trim()) return;
    setLoading(true);
    const r = await apiJson<AiRes>("/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({ requestId: requestId ?? undefined, message: text.trim() }),
    });
    setLoading(false);
    setText("");
    if (r.ok && r.data) {
      setRequestId(r.data.requestId);
      setLastAi(r.data.ai);
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

  const saveLoc = async () => {
    if (!requestId) return;
    await apiJson(`/api/requests/${requestId}/location`, {
      method: "PATCH",
      body: JSON.stringify({
        lat: 41.3111,
        lng: 69.2797,
        address: "Toshkent",
      }),
    });
  };

  return (
    <div className="min-h-dvh flex flex-col px-4 pt-4">
      <TwaShell />
      <header className="mb-3">
        <h1 className="text-lg font-bold gradient-text">Dispetcher AI</h1>
        <p className="text-xs text-white/50">
          Qisqa yozing — tizim kategoriya, shoshilinchlik va narx diapazonini ajratadi.
        </p>
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
        <textarea
          className="w-full min-h-[88px] rounded-xl bg-black/35 border border-white/10 px-3 py-2 text-sm outline-none focus:border-cyan-400/40 resize-none"
          placeholder="Masalan: Oshxonamda oq suv oqib chiqyapti, shoshilinch…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex gap-2">
          <PrimaryButton
            className="flex-1"
            disabled={loading}
            onClick={send}
          >
            {loading ? "Kutilmoqda…" : "Yuborish"}
          </PrimaryButton>
        </div>
        {requestId && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              className="rounded-xl bg-white/5 border border-white/10 py-2 text-xs"
              onClick={saveLoc}
            >
              Joylashuv (demo)
            </button>
            <PrimaryButton className="!py-2 !text-xs" onClick={submitReq}>
              So‘rovni tasdiqlash
            </PrimaryButton>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
