"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadWebApp } from "@/lib/twa";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { apiJson } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TwaShell } from "@/components/telegram/TwaShell";
import { haptic, hapticSuccess } from "@/lib/haptic";
import { useI18n } from "@/lib/i18n";

type WorkerInboxData = {
  newOrders: {
    id: string;
    status: string;
    price_cents: number;
    requests?: { summary?: string | null };
  }[];
  openRequests: {
    id: string;
    summary?: string | null;
    category?: string | null;
    last_client_image_url?: string | null;
    last_image_caption?: string | null;
  }[];
  balanceCents: number;
  freeAcceptsRemaining: number;
};

export default function WorkerInboxPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [data, setData] = useState<WorkerInboxData | null>(null);

  useEffect(() => {
    void loadWebApp().then((WebApp) => {
      WebApp.BackButton.hide();
    });
  }, []);

  const refresh = async () => {
    const r = await apiJson<WorkerInboxData>("/api/worker/inbox");
    if (r.ok && r.data) setData(r.data);
  };

  useEffect(() => {
    refresh();
    let ch: ReturnType<typeof setInterval> | undefined;
    try {
      const sb = createBrowserSupabase();
      const sub = sb
        .channel("usta_orders")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders" },
          () => refresh()
        )
        .subscribe();
      ch = setInterval(refresh, 8000);
      return () => {
        sub.unsubscribe();
        if (ch) clearInterval(ch);
      };
    } catch {
      ch = setInterval(refresh, 5000);
      return () => {
        if (ch) clearInterval(ch);
      };
    }
  }, []);

  const reserve = async (requestId: string) => {
    const r = await apiJson<{ orderId?: string }>("/api/worker/reserve-request", {
      method: "POST",
      body: JSON.stringify({ requestId }),
    });
    if (r.ok && r.data?.orderId) {
      hapticSuccess();
      router.push(`/worker/order/${r.data.orderId}`);
      return;
    }
    const WebApp = await loadWebApp();
    WebApp.showAlert(r.error || t("auth_failed"));
    refresh();
  };

  return (
    <div className="min-h-dvh px-4 pt-4 pb-28">
      <TwaShell />
      <h1 className="text-lg font-bold gradient-text mb-1">{t("worker_dash_title")}</h1>
      <p className="text-xs text-white/50 mb-3">
        {t("worker_dash_hint")}
      </p>
      
      {data && (
        <GlassCard className="p-3 mb-6 bg-cyan-400/5 border-cyan-400/20">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase text-white/40 mb-1">{t("leads_balance")}</p>
              <p className="text-lg font-bold text-white tabular-nums">
                {data.balanceCents.toLocaleString()} {t("sum_currency")}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase text-white/40 mb-1">{t("free_accepts_remaining")}</p>
              <p className="text-lg font-bold text-cyan-200 tabular-nums">
                {data.freeAcceptsRemaining}
              </p>
            </div>
          </div>
          <Link href="/worker/profile">
            <button
              className="w-full mt-3 rounded-lg bg-white/10 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-white/70 hover:bg-white/15"
              onClick={() => haptic.impact("light")}
            >
              {t("topup_card")} / {t("profile_label")} →
            </button>
          </Link>
        </GlassCard>
      )}

      <p className="text-xs text-white/40 mb-2 uppercase tracking-wider">
        {t("my_orders")}
      </p>
      <div className="space-y-2 mb-6">
        {data?.newOrders?.map((o) => (
          <Link key={o.id} href={`/worker/order/${o.id}`}>
            <GlassCard className="p-3">
              <p className="text-[10px] uppercase text-fuchsia-300/80 mb-0.5">
                {o.status === "pending_worker"
                  ? "Tasdiqlash kutilmoqda (bozor)"
                  : "Mijoz tanladi"}
              </p>
              <p className="text-sm">{o.requests?.summary || "Buyurtma"}</p>
              <p className="text-[11px] text-white/45">
                {o.price_cents.toLocaleString()} so‘m
              </p>
            </GlassCard>
          </Link>
        ))}
        {!data?.newOrders?.length && (
          <p className="text-xs text-white/40">{t("no_new_orders")}</p>
        )}
      </div>
      <p className="text-xs text-white/40 mb-2 uppercase tracking-wider">
        {t("market_requests")}
      </p>
      <div className="space-y-2">
        {data?.openRequests?.map((req) => (
          <GlassCard key={req.id} className="p-3 space-y-2">
            {req.last_client_image_url && (
              <div className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={req.last_client_image_url}
                  alt=""
                  className="w-full max-h-48 rounded-xl object-contain border border-white/10 bg-black/30"
                  referrerPolicy="no-referrer"
                />
                {req.last_image_caption && (
                  <p className="text-xs text-white/75 whitespace-pre-wrap">{req.last_image_caption}</p>
                )}
              </div>
            )}
            <p className="text-sm">{req.summary}</p>
            <p className="text-[11px] text-white/45">{req.category}</p>
            <PrimaryButton
              className="!py-2 !text-xs"
              onClick={() => {
                haptic.impact("medium");
                void reserve(req.id);
              }}
            >
              {t("reserve")}
            </PrimaryButton>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
