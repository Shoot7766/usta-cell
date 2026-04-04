"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadWebApp } from "@/lib/twa";
import { apiJson } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
import { TwaShell } from "@/components/telegram/TwaShell";
import { haptic } from "@/lib/haptic";
import { useI18n } from "@/lib/i18n";

type Row = {
  id: string;
  status: string;
  price_cents: number;
  contract_number?: string | null;
  requests?: { summary?: string | null };
};

const statusKeys: Record<string, string> = {
  pending_worker: "status_pending_worker",
  new: "status_new",
  accepted: "status_accepted",
  in_progress: "status_in_progress",
  completed: "status_completed",
  canceled: "status_canceled",
};

export default function WorkerOrdersPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    void loadWebApp().then((WebApp) => {
      WebApp.BackButton.hide();
    });
  }, []);

  useEffect(() => {
    (async () => {
      const r = await apiJson<{ orders: Row[] }>("/api/orders");
      if (r.ok && r.data) setRows(r.data.orders);
    })();
  }, []);

  return (
    <div className="min-h-dvh px-4 pt-4 pb-28">
      <TwaShell />
      <h1 className="text-lg font-bold gradient-text mb-3">{t("my_orders")}</h1>
      <div className="space-y-3">
        {rows.map((o) => (
          <Link
            key={o.id}
            href={`/worker/order/${o.id}`}
            onClick={() => haptic.impact("light")}
          >
            <GlassCard className="p-4">
              {o.contract_number && (
                <p className="text-[10px] font-mono text-cyan-200/85 mb-1">{o.contract_number}</p>
              )}
              <p className="text-sm">{o.requests?.summary || t("order")}</p>
              <p className="text-xs text-white/45 mt-1">
                {t((statusKeys[o.status] || o.status) as any)} · {o.price_cents.toLocaleString()} {t("sum_currency")}
              </p>
            </GlassCard>
          </Link>
        ))}
      </div>
    </div>
  );
}
