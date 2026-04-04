"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadWebApp } from "@/lib/twa";
import { apiJson } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
import { TwaShell } from "@/components/telegram/TwaShell";
import { haptic } from "@/lib/haptic";
import { useI18n } from "@/lib/i18n";
import { Skeleton } from "@/components/ui/Skeleton";

type Row = {
  id: string;
  status: string;
  price_cents: number;
  contract_number?: string | null;
  requests?: { summary?: string | null };
};

export default function ClientOrdersPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadWebApp().then((WebApp) => {
      WebApp.BackButton.hide();
    });
  }, []);

  const fetchOrders = async () => {
    const r = await apiJson<{ orders: Row[] }>("/api/orders");
    setLoading(false);
    if (r.ok && r.data) setRows(r.data.orders);
  };

  useEffect(() => {
    void fetchOrders();
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void fetchOrders();
    };
    const onShow = () => void fetchOrders();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onShow);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", onShow);
    };
  }, []);

  return (
    <div className="min-h-dvh px-4 pt-4 pb-28">
      <TwaShell />
      <h1 className="text-lg font-bold gradient-text mb-3">{t("my_orders")}</h1>
      <div className="space-y-3">
        {loading && (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </>
        )}
        {!loading && rows.map((o) => (
          <Link
            key={o.id}
            href={`/client/order/${o.id}`}
            onClick={() => haptic.impact("light")}
          >
            <GlassCard className="p-4" glow>
              {o.contract_number && (
                <p className="text-[10px] font-mono text-cyan-200/85 mb-1">{o.contract_number}</p>
              )}
              <p className="text-sm font-medium text-white">
                {o.requests?.summary || t("order")}
              </p>
              <p className="text-xs text-white/45 mt-1">
                {t(`status_${o.status}` as Parameters<typeof t>[0])} · {o.price_cents.toLocaleString()} {t("sum_currency")}
              </p>
            </GlassCard>
          </Link>
        ))}
        {!loading && rows.length === 0 && (
          <p className="text-sm text-white/45">{t("no_new_orders")}</p>
        )}
      </div>
    </div>
  );
}
