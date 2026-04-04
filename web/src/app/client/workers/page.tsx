"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { loadWebApp } from "@/lib/twa";
import { apiJson } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TwaShell } from "@/components/telegram/TwaShell";
import { motion, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { haptic, hapticLight, hapticSuccess } from "@/lib/haptic";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";
import { Skeleton } from "@/components/ui/Skeleton";

type W = {
  user_id: string;
  display_name: string | null;
  rating_avg: number;
  rating_count?: number;
  distance_km: number | null;
  score: number;
  badges: string[];
  price_min_cents: number;
  price_max_cents: number;
  eta_hint?: number;
  portfolio_preview?: { image_url: string; caption?: string | null }[];
};

const badgeKeys: Record<string, string> = {
  top_worker: "top_worker",
  fast_response: "fast_response",
  nearby: "nearby",
};

function WorkerSwipeCard({
  w,
  onPick,
  busy,
  anyOrdering,
  requestId,
  t,
}: {
  w: W;
  onPick: () => void;
  busy: boolean;
  anyOrdering: boolean;
  requestId: string;
  t: (key: TranslationKey) => string;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-120, 120], [-6, 6]);
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (anyOrdering) return;
    if (info.offset.x > 80) {
      hapticLight();
      onPick();
    }
  };
  return (
    <motion.div
      style={{ x, rotate }}
      drag={anyOrdering ? false : "x"}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.2}
      onDragEnd={onDragEnd}
      className="touch-pan-y"
    >
      <GlassCard
        className={`p-4 mb-3 ${anyOrdering ? "opacity-60 pointer-events-none" : ""}`}
        glow
      >
        <div className="flex justify-between items-start gap-2">
          <div>
            <p className="font-semibold text-white">
              {w.display_name || t("worker_role")}
            </p>
            <p className="text-xs text-white/45">
              ⭐ {w.rating_avg.toFixed(2)} · {w.rating_count ?? 0} {t("reviews_count")} ·{" "}
              {w.distance_km != null ? `${w.distance_km.toFixed(1)} km` : `? ${t("distance")}`}
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
              {t((badgeKeys[b] || b) as TranslationKey)}
            </span>
          ))}
        </div>
        {(w.price_min_cents > 0 || w.price_max_cents > 0) && (
          <p className="text-xs text-white/55 mt-2">
            Narx: {w.price_min_cents.toLocaleString()} — {w.price_max_cents.toLocaleString()}{" "}
            sum
          </p>
        )}
        {w.price_min_cents <= 0 && w.price_max_cents <= 0 && (
          <p className="text-xs text-white/45 mt-2">{t("price_negotiable")}</p>
        )}
        {w.portfolio_preview && w.portfolio_preview.length > 0 && (
          <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1 -mx-1 px-1">
            {w.portfolio_preview.map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${p.image_url}-${i}`}
                src={p.image_url}
                alt={p.caption || ""}
                className="h-14 w-14 rounded-lg object-cover border border-white/10 shrink-0 bg-black/30"
                referrerPolicy="no-referrer"
              />
            ))}
          </div>
        )}
        <PrimaryButton className="mt-3 !py-2.5" disabled={anyOrdering} onClick={onPick}>
          {busy ? t("loading") : t("pick")}
        </PrimaryButton>
        <Link
          href={
            requestId
              ? `/client/worker/${w.user_id}?requestId=${encodeURIComponent(requestId)}`
              : `/client/worker/${w.user_id}`
          }
          className="mt-2 block text-center text-xs text-cyan-300/90 underline underline-offset-2"
          onClick={() => haptic.impact("light")}
        >
          {t("portfolio")} ({t("comment_hint")})
        </Link>
        <p className="text-[10px] text-white/35 mt-2 text-center">
          {t("swipe_hint")}
        </p>
      </GlassCard>
    </motion.div>
  );
}

function WorkersPageContent() {
  const { t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const requestId = sp.get("requestId") || "";
  const [workers, setWorkers] = useState<W[]>([]);
  const [orderingId, setOrderingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadWebApp().then((WebApp) => {
      if (cancelled) return;
      WebApp.BackButton.show();
      WebApp.BackButton.onClick(() => {
        haptic.impact("light");
        router.push("/client/chat");
      });
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
    void (async () => {
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

  const pickWorker = async (w: W) => {
    if (!requestId || orderingId) return;
    setOrderingId(w.user_id);
    const r = await apiJson<{ orderId: string }>("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        requestId,
        workerId: w.user_id,
      }),
    });
    setOrderingId(null);
    if (r.ok && r.data?.orderId) {
      hapticSuccess();
      router.push(`/client/order/${r.data.orderId}`);
      return;
    }
    const WebApp = await loadWebApp();
    WebApp.showAlert(r.error || t("auth_failed"));
  };

  return (
    <div className="min-h-dvh px-4 pt-4 pb-28">
      <TwaShell />
      <h1 className="text-lg font-bold gradient-text mb-1">{t("workers_title")}</h1>
      <p className="text-xs text-white/50 mb-3">
        {t("workers_hint")}
      </p>
      {sorted.map((w) => (
        <WorkerSwipeCard
          key={w.user_id}
          w={w}
          requestId={requestId}
          busy={orderingId === w.user_id}
          anyOrdering={orderingId !== null}
          onPick={() => {
              haptic.impact("medium");
              void pickWorker(w);
          }}
          t={t}
        />
      ))}
      {sorted.length === 0 && requestId && (
        <p className="text-sm text-white/45">{t("no_matches")}</p>
      )}
    </div>
  );
}

export default function WorkersPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh p-5 space-y-4">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      }
    >
      <WorkersPageContent />
    </Suspense>
  );
}
