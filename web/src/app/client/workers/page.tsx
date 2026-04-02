"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadWebApp } from "@/lib/twa";
import { apiJson } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TwaShell } from "@/components/telegram/TwaShell";
import { motion, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { hapticLight } from "@/lib/haptic";

type W = {
  user_id: string;
  display_name: string | null;
  rating_avg: number;
  distance_km: number | null;
  score: number;
  badges: string[];
  price_min_cents: number;
  price_max_cents: number;
  eta_hint?: number;
};

const badgeUz: Record<string, string> = {
  top_worker: "Top usta",
  fast_response: "Tez javob",
  nearby: "Yaqin",
};

function WorkerSwipeCard({
  w,
  onPick,
}: {
  w: W;
  onPick: () => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-120, 120], [-6, 6]);
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > 80) {
      hapticLight();
      onPick();
    }
  };
  return (
    <motion.div
      style={{ x, rotate }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.2}
      onDragEnd={onDragEnd}
      className="touch-pan-y"
    >
      <GlassCard className="p-4 mb-3" glow>
        <div className="flex justify-between items-start gap-2">
          <div>
            <p className="font-semibold text-white">
              {w.display_name || "Usta"}
            </p>
            <p className="text-xs text-white/45">
              ⭐ {w.rating_avg.toFixed(2)} ·{" "}
              {w.distance_km != null ? `${w.distance_km.toFixed(1)} km` : "masofa ?"}
            </p>
          </div>
          <span className="text-[11px] px-2 py-1 rounded-full bg-cyan-500/15 text-cyan-200 border border-cyan-400/20">
            {Math.round(w.score * 100)} ball
          </span>
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {w.badges.map((b) => (
            <span
              key={b}
              className="text-[10px] px-2 py-0.5 rounded-full bg-fuchsia-500/15 text-fuchsia-100 border border-fuchsia-400/15"
            >
              {badgeUz[b] ?? b}
            </span>
          ))}
        </div>
        <p className="text-xs text-white/55 mt-2">
          Narx: {w.price_min_cents.toLocaleString()} — {w.price_max_cents.toLocaleString()}{" "}
          so‘m
        </p>
        <PrimaryButton className="mt-3 !py-2.5" onClick={onPick}>
          Tanlash
        </PrimaryButton>
        <p className="text-[10px] text-white/35 mt-2 text-center">
          O‘ngga suring — tez tanlash
        </p>
      </GlassCard>
    </motion.div>
  );
}

function WorkersPageContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const requestId = sp.get("requestId") || "";
  const [workers, setWorkers] = useState<W[]>([]);
  const [pick, setPick] = useState<W | null>(null);
  const [price, setPrice] = useState("150000");
  const [eta, setEta] = useState("45");

  useEffect(() => {
    let cancelled = false;
    void loadWebApp().then((WebApp) => {
      if (cancelled) return;
      WebApp.BackButton.show();
      WebApp.BackButton.onClick(() => router.push("/client/chat"));
    });
    return () => {
      cancelled = true;
      void loadWebApp().then((WebApp) => {
        WebApp.BackButton.hide();
      });
    };
  }, [router]);

  useEffect(() => {
    if (!requestId) return;
    (async () => {
      const r = await apiJson<{ workers: W[] }>(
        `/api/match?requestId=${encodeURIComponent(requestId)}`
      );
      if (r.ok && r.data) setWorkers(r.data.workers);
    })();
  }, [requestId]);

  const sorted = useMemo(
    () => [...workers].sort((a, b) => b.score - a.score),
    [workers]
  );

  const confirm = async () => {
    if (!pick || !requestId) return;
    const r = await apiJson<{ orderId: string }>("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        requestId,
        workerId: pick.user_id,
        priceCents: parseInt(price, 10) || 0,
        etaMinutes: parseInt(eta, 10) || 30,
      }),
    });
    if (r.ok && r.data?.orderId) {
      router.push(`/client/order/${r.data.orderId}`);
    }
  };

  return (
    <div className="min-h-dvh px-4 pt-4 pb-28">
      <TwaShell />
      <h1 className="text-lg font-bold gradient-text mb-1">Ustalar</h1>
      <p className="text-xs text-white/50 mb-3">
        Masofa, reyting, javob tezligi, mavjudlik va narx mosligi bo‘yicha saralangan.
      </p>
      {!pick &&
        sorted.map((w) => (
          <WorkerSwipeCard key={w.user_id} w={w} onPick={() => setPick(w)} />
        ))}
      {pick && (
        <GlassCard className="p-4 space-y-3" glow>
          <p className="font-semibold">{pick.display_name}</p>
          <p className="text-xs text-white/55">
            Reyting: {pick.rating_avg} · ETA taxminiy: {eta} daqiqa
          </p>
          <input
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Narx (so‘m)"
          />
          <input
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
            value={eta}
            onChange={(e) => setEta(e.target.value)}
            placeholder="ETA (daq)"
          />
          <PrimaryButton onClick={confirm}>Buyurtmani tasdiqlash</PrimaryButton>
          <button
            type="button"
            className="w-full text-xs text-white/45"
            onClick={() => setPick(null)}
          >
            Orqaga
          </button>
        </GlassCard>
      )}
    </div>
  );
}

export default function WorkersPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh p-4 text-white/50 flex items-center justify-center">
          Yuklanmoqda…
        </div>
      }
    >
      <WorkersPageContent />
    </Suspense>
  );
}
