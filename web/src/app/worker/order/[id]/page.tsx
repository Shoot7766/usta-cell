"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { loadWebApp } from "@/lib/twa";
import { apiJson } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TwaShell } from "@/components/telegram/TwaShell";
import { PAYMENT_METHOD_UZ, PAYMENT_STATUS_UZ } from "@/lib/payment-labels";

export default function WorkerOrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [status, setStatus] = useState("new");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [priceCents, setPriceCents] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentStatus, setPaymentStatus] = useState("pending");
  const [payLoading, setPayLoading] = useState(false);

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
      order: {
        status: string;
        request_id: string;
        price_cents?: number;
        payment_method?: string;
        payment_status?: string;
      };
    }>(`/api/orders/${id}`);
    if (r.ok && r.data) {
      setStatus(r.data.order.status);
      setRequestId(r.data.order.request_id);
      if (typeof r.data.order.price_cents === "number") {
        setPriceCents(r.data.order.price_cents);
      }
      if (r.data.order.payment_method) setPaymentMethod(r.data.order.payment_method);
      if (r.data.order.payment_status) setPaymentStatus(r.data.order.payment_status);
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

  const confirmPayment = async () => {
    setPayLoading(true);
    await apiJson(`/api/orders/${id}/payment`, {
      method: "PATCH",
      body: JSON.stringify({ paymentStatus: "confirmed" }),
    });
    setPayLoading(false);
    load();
  };

  return (
    <div className="min-h-dvh px-4 pt-4 pb-28 space-y-3">
      <TwaShell />
      <h1 className="text-lg font-bold gradient-text">Buyurtma</h1>
      <GlassCard className="p-4 space-y-2">
        <p className="text-sm text-white/80">Holat: {status}</p>
        <p className="text-xs text-white/55">
          Summa: <strong>{priceCents.toLocaleString()} so‘m</strong>
        </p>
        <p className="text-xs text-white/55">
          To‘lov: {PAYMENT_METHOD_UZ[paymentMethod] ?? paymentMethod} ·{" "}
          {PAYMENT_STATUS_UZ[paymentStatus] ?? paymentStatus}
        </p>
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
      {["accepted", "in_progress"].includes(status) &&
        paymentStatus === "pending" && (
          <PrimaryButton
            className="!py-2 !text-xs"
            variant="ghost"
            disabled={payLoading}
            onClick={() => void confirmPayment()}
          >
            {payLoading ? "…" : "To‘lov qabul qilindi (tasdiqlash)"}
          </PrimaryButton>
        )}
    </div>
  );
}
