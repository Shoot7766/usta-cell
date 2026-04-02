"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadWebApp } from "@/lib/twa";
import { apiJson } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
import { TwaShell } from "@/components/telegram/TwaShell";

type Row = {
  id: string;
  status: string;
  price_cents: number;
  requests?: { summary?: string | null };
};

export default function ClientOrdersPage() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    void loadWebApp().then((WebApp) => {
      WebApp.BackButton.hide();
    });
  }, []);

  const fetchOrders = async () => {
    const r = await apiJson<{ orders: Row[] }>("/api/orders");
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
      <h1 className="text-lg font-bold gradient-text mb-3">Buyurtmalar</h1>
      <div className="space-y-3">
        {rows.map((o) => (
          <Link key={o.id} href={`/client/order/${o.id}`}>
            <GlassCard className="p-4">
              <p className="text-sm font-medium text-white">
                {o.requests?.summary || "Buyurtma"}
              </p>
              <p className="text-xs text-white/45 mt-1">
                {o.status} · {o.price_cents.toLocaleString()} so‘m
              </p>
            </GlassCard>
          </Link>
        ))}
        {rows.length === 0 && (
          <p className="text-sm text-white/45">Hozircha buyurtma yo‘q.</p>
        )}
      </div>
    </div>
  );
}
