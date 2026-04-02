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
  contract_number?: string | null;
  requests?: { summary?: string | null };
};

const statusUz: Record<string, string> = {
  pending_worker: "Tasdiqlanmoqda (bozor)",
  new: "Yangi",
  accepted: "Qabul qilindi",
  in_progress: "Ishlanmoqda",
  completed: "Yakunlandi",
  canceled: "Bekor / rad",
};

export default function WorkerOrdersPage() {
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
      <h1 className="text-lg font-bold gradient-text mb-3">Mening buyurtmalarim</h1>
      <div className="space-y-3">
        {rows.map((o) => (
          <Link key={o.id} href={`/worker/order/${o.id}`}>
            <GlassCard className="p-4">
              {o.contract_number && (
                <p className="text-[10px] font-mono text-cyan-200/85 mb-1">{o.contract_number}</p>
              )}
              <p className="text-sm">{o.requests?.summary || "Buyurtma"}</p>
              <p className="text-xs text-white/45 mt-1">
                {statusUz[o.status] ?? o.status}
              </p>
            </GlassCard>
          </Link>
        ))}
      </div>
    </div>
  );
}
