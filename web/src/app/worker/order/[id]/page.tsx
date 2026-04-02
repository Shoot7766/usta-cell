"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { loadWebApp } from "@/lib/twa";
import { apiJson } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TwaShell } from "@/components/telegram/TwaShell";

export default function WorkerOrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [status, setStatus] = useState("new");
  const [requestId, setRequestId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadWebApp().then((WebApp) => {
      if (cancelled) return;
      WebApp.BackButton.show();
      WebApp.BackButton.onClick(() => router.push("/worker/orders"));
    });
    return () => {
      cancelled = true;
      void loadWebApp().then((WebApp) => {
        WebApp.BackButton.hide();
      });
    };
  }, [router]);

  const load = async () => {
    const r = await apiJson<{
      order: { status: string; request_id: string };
    }>(`/api/orders/${id}`);
    if (r.ok && r.data) {
      setStatus(r.data.order.status);
      setRequestId(r.data.order.request_id);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const setSt = async (s: "accepted" | "in_progress" | "completed") => {
    await apiJson(`/api/orders/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status: s }),
    });
    load();
  };

  const unlock = async () => {
    if (!requestId) return;
    await apiJson("/api/worker/lead-unlock", {
      method: "POST",
      body: JSON.stringify({ requestId }),
    });
    load();
  };

  const cancel = async () => {
    await apiJson(`/api/orders/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ as: "worker" }),
    });
    load();
  };

  return (
    <div className="min-h-dvh px-4 pt-4 pb-28 space-y-3">
      <TwaShell />
      <h1 className="text-lg font-bold gradient-text">Buyurtma</h1>
      <GlassCard className="p-4">
        <p className="text-sm text-white/80">Holat: {status}</p>
      </GlassCard>
      <PrimaryButton className="!py-2 !text-xs" variant="ghost" onClick={unlock}>
        Lead: mijoz kontakti
      </PrimaryButton>
      {status === "new" && (
        <div className="grid grid-cols-2 gap-2">
          <PrimaryButton className="!py-2 !text-xs" onClick={() => setSt("accepted")}>
            Qabul
          </PrimaryButton>
          <PrimaryButton className="!py-2 !text-xs" variant="ghost" onClick={cancel}>
            Rad
          </PrimaryButton>
        </div>
      )}
      {status === "accepted" && (
        <PrimaryButton className="!py-2 !text-xs" onClick={() => setSt("in_progress")}>
          Ish boshlandi
        </PrimaryButton>
      )}
      {status === "in_progress" && (
        <PrimaryButton className="!py-2 !text-xs" onClick={() => setSt("completed")}>
          Yakunlash
        </PrimaryButton>
      )}
    </div>
  );
}
