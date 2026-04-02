"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { loadWebApp } from "@/lib/twa";
import { apiJson } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TwaShell } from "@/components/telegram/TwaShell";

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
        setErr(r.error || "Yuklanmadi");
        return;
      }
      setData(r.data ?? null);
    })();
  }, [id]);

  if (!id) {
    return (
      <div className="min-h-dvh px-4 pt-4 pb-28">
        <TwaShell />
        <p className="text-sm text-white/60">Noto‘g‘ri havola.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-dvh px-4 pt-4 pb-28 flex items-center justify-center">
        <TwaShell />
        <p className="text-sm text-white/50">Yuklanmoqda…</p>
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="min-h-dvh px-4 pt-4 pb-28">
        <TwaShell />
        <p className="text-sm text-white/60">{err || "Ma’lumot yo‘q"}</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh px-4 pt-4 pb-28">
      <TwaShell />
      <h1 className="text-lg font-bold gradient-text mb-1">
        {data.displayName || "Usta"}
      </h1>
      <p className="text-xs text-white/50 mb-3">
        ⭐ {data.ratingAvg.toFixed(2)} · {data.ratingCount} sharh
        {data.cityName ? ` · ${data.cityName}` : ""}
        {!data.isAvailable && " · hozir band bo‘lishi mumkin"}
      </p>

      {data.bio?.trim() && (
        <GlassCard className="p-4 mb-3 space-y-2">
          <p className="text-[10px] uppercase text-white/40">O‘zi haqida</p>
          <p className="text-sm text-white/85 whitespace-pre-wrap">{data.bio}</p>
        </GlassCard>
      )}

      {data.services.length > 0 && (
        <GlassCard className="p-4 mb-3 space-y-2">
          <p className="text-[10px] uppercase text-white/40">Xizmatlar</p>
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
        <p className="text-[10px] uppercase text-white/40">Portfolio</p>
        {data.portfolio.length === 0 && (
          <p className="text-xs text-white/45">Hozircha rasm yo‘q.</p>
        )}
        <div className="space-y-4">
          {data.portfolio.map((item, i) => (
            <div key={`${item.imageUrl}-${i}`} className="space-y-2">
              <p className="text-xs font-semibold text-cyan-200/85">#{i + 1}</p>
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
                <p className="text-[11px] text-white/35">Izoh yo‘q</p>
              )}
            </div>
          ))}
        </div>
      </GlassCard>

      {requestId && (
        <PrimaryButton
          className="w-full"
          onClick={() =>
            router.replace(`/client/workers?requestId=${encodeURIComponent(requestId)}`)
          }
        >
          Orqaga — tanlash
        </PrimaryButton>
      )}
    </div>
  );
}
