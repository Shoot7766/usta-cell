"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { loadWebApp } from "@/lib/twa";
import { apiJson } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TwaShell } from "@/components/telegram/TwaShell";
import { haptic } from "@/lib/haptic";
import { useI18n } from "@/lib/i18n";
import { Skeleton } from "@/components/ui/Skeleton";

type WorkerPublic = {
  workerId: string;
  displayName: string | null;
  bio: string | null;
  cityName: string | null;
  services: string[];
  ratingAvg: number;
  ratingCount: number;
  isAvailable: boolean;
  portfolio: { imageUrl: string; caption?: string }[];
};

export default function ClientWorkerProfilePage() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams();
  const sp = useSearchParams();
  const id = typeof params.id === "string" ? params.id : "";
  const requestId = sp.get("requestId") || "";
  const [data, setData] = useState<WorkerPublic | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadWebApp().then((WebApp) => {
      WebApp.BackButton.show();
      WebApp.BackButton.onClick(() => {
        haptic.impact("light");
        if (requestId) {
          router.replace(`/client/workers?requestId=${encodeURIComponent(requestId)}`);
        } else {
          router.replace("/client/workers");
        }
      });
    });
    return () => {
      void loadWebApp().then((WebApp) => WebApp.BackButton.hide());
    };
  }, [router, requestId]);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    void (async () => {
      const WebApp = await loadWebApp();
      if (WebApp.initData) {
        await apiJson("/api/auth/telegram", {
          method: "POST",
          body: JSON.stringify({ initData: WebApp.initData }),
        });
      }
      const r = await apiJson<WorkerPublic>(`/api/client/workers/${id}`);
      setLoading(false);
      if (!r.ok) {
        setErr(r.error || t("auth_failed"));
        return;
      }
      setData(r.data ?? null);
    })();
  }, [id, t]);

  if (!id) {
    return (
      <div className="min-h-dvh px-4 pt-4 pb-28">
        <TwaShell />
        <p className="text-sm text-white/60">404</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-dvh px-4 pt-4 pb-28 space-y-4">
        <TwaShell />
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="min-h-dvh px-4 pt-4 pb-28">
        <TwaShell />
        <p className="text-sm text-white/60">{err || t("no_matches")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh px-4 pt-4 pb-28">
      <TwaShell />
      <h1 className="text-lg font-bold gradient-text mb-1">
        {data.displayName || t("worker_role")}
      </h1>
      <p className="text-xs text-white/50 mb-3">
        ⭐ {data.ratingAvg.toFixed(2)} · {data.ratingCount} {t("reviews_count")}
        {data.cityName ? ` · ${data.cityName}` : ""}
        {!data.isAvailable && ` · ${t("loading")}`}
      </p>

      {data.bio?.trim() ? (
        <GlassCard className="p-4 mb-3 space-y-2">
          <p className="text-[10px] uppercase text-white/40">{t("about_worker")}</p>
          <p className="text-sm text-white/85 whitespace-pre-wrap">{data.bio}</p>
        </GlassCard>
      ) : (
        <GlassCard className="p-4 mb-3">
          <p className="text-xs text-white/35 italic">{t("no_worker_bio")}</p>
        </GlassCard>
      )}

      {data.services.length > 0 && (
        <GlassCard className="p-4 mb-3 space-y-2">
          <p className="text-[10px] uppercase text-white/40">{t("services_label")}</p>
          <div className="flex flex-wrap gap-1.5">
            {data.services.map((s) => (
              <span
                key={s}
                className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 border border-white/10"
              >
                {s}
              </span>
            ))}
          </div>
        </GlassCard>
      )}

      <GlassCard className="p-4 mb-3 space-y-3">
        <p className="text-[10px] uppercase text-white/40">{t("portfolio")}</p>
        {data.portfolio.length === 0 && (
          <p className="text-xs text-white/45">{t("no_matches")}</p>
        )}
        <div className="space-y-4">
          {data.portfolio.map((item, i) => (
            <div key={`${item.imageUrl}-${i}`} className="space-y-2">
              <p className="text-xs font-semibold text-cyan-200/85">{t("portfolio")} #{i + 1}</p>
              {item.imageUrl.startsWith("http") && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.imageUrl}
                  alt={item.caption || ""}
                  className="w-full max-h-64 rounded-xl object-cover border border-white/10"
                  referrerPolicy="no-referrer"
                />
              )}
              {item.caption?.trim() ? (
                <p className="text-sm text-white/80 whitespace-pre-wrap">{item.caption}</p>
              ) : (
                <p className="text-[11px] text-white/35">{t("comment_hint")}</p>
              )}
            </div>
          ))}
        </div>
      </GlassCard>

      {requestId && (
        <PrimaryButton
          className="w-full"
          onClick={() => {
            haptic.impact("light");
            router.replace(`/client/workers?requestId=${encodeURIComponent(requestId)}`);
          }}
        >
          {t("back_to_list")}
        </PrimaryButton>
      )}
    </div>
  );
}
