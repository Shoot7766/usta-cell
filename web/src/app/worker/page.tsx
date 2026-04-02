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
};

export default function WorkerInboxPage() {
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
      router.push(`/worker/order/${r.data.orderId}`);
      return;
    }
    const WebApp = await loadWebApp();
    WebApp.showAlert(r.error || "Band qilinmadi");
    refresh();
  };

  return (
    <div className="min-h-dvh px-4 pt-4 pb-28">
      <TwaShell />
      <h1 className="text-lg font-bold gradient-text mb-1">Xabarlar</h1>
      <p className="text-xs text-white/50 mb-3">
        Yangi buyurtmalar va bozordagi so‘rovlar — real vaqt va qayta tekshiruv.
      </p>
      <p className="text-xs text-white/40 mb-2 uppercase tracking-wider">
        Sizga kelgan buyurtmalar
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
          <p className="text-xs text-white/40">Hozircha yangi buyurtma yo‘q.</p>
        )}
      </div>
      <p className="text-xs text-white/40 mb-2 uppercase tracking-wider">
        Bozor so‘rovlari
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
            <PrimaryButton className="!py-2 !text-xs" onClick={() => void reserve(req.id)}>
              Band qilish
            </PrimaryButton>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
