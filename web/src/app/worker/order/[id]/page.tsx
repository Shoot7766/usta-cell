"use client";

import { useEffect, useState, useRef } from "react";
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
  const [payoutReleased, setPayoutReleased] = useState(false);
  const [reqLine, setReqLine] = useState("");
  const [workerPriceOk, setWorkerPriceOk] = useState(false);
  const [confirmPriceBusy, setConfirmPriceBusy] = useState(false);
  const [contractNumber, setContractNumber] = useState<string | null>(null);
  const [clientIssueImageUrl, setClientIssueImageUrl] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

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
        payout_released?: boolean;
        contract_number?: string | null;
        client_issue_image_url?: string | null;
        requests?: { summary?: string | null; category?: string | null } | null;
      };
      events: { event_type: string }[];
    }>(`/api/orders/${id}`);
    if (r.ok && r.data) {
      setStatus(r.data.order.status);
      setRequestId(r.data.order.request_id);
      if (typeof r.data.order.price_cents === "number") {
        setPriceCents(r.data.order.price_cents);
      }
      if (r.data.order.payment_method) setPaymentMethod(r.data.order.payment_method);
      if (r.data.order.payment_status) setPaymentStatus(r.data.order.payment_status);
      if (typeof r.data.order.payout_released === "boolean") {
        setPayoutReleased(r.data.order.payout_released);
      }
      const cn = r.data.order.contract_number;
      if (typeof cn === "string" && cn.trim()) setContractNumber(cn.trim());
      const rq = r.data.order.requests;
      if (rq && (rq.summary || rq.category)) {
        setReqLine([rq.category, rq.summary].filter(Boolean).join(" — "));
      } else {
        setReqLine("");
      }
      setWorkerPriceOk(
        r.data.events.some((e) => e.event_type === "worker_confirmed_agreed_price")
      );
      const imgUrl = r.data.order.client_issue_image_url;
      setClientIssueImageUrl(
        typeof imgUrl === "string" && imgUrl.startsWith("http") ? imgUrl : null
      );
    }
  };

  useEffect(() => {
    void load();
    const es = new EventSource(`/api/orders/${id}/stream`);
    esRef.current = es;
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as {
          order?: { payout_released?: boolean; status?: string };
        };
        if (typeof msg?.order?.payout_released === "boolean") {
          setPayoutReleased(msg.order.payout_released);
        }
        if (msg?.order?.status) setStatus(msg.order.status);
      } catch {
        /* */
      }
    };
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const setSt = async (s: "accepted" | "in_progress" | "completed") => {
    const r = await apiJson(`/api/orders/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status: s }),
    });
    if (!r.ok && r.error) {
      const WebApp = await loadWebApp();
      WebApp.showAlert(r.error);
    }
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

  const confirmAgreedPrice = async () => {
    setConfirmPriceBusy(true);
    const r = await apiJson(`/api/orders/${id}/agreed-price`, {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    });
    setConfirmPriceBusy(false);
    if (r.ok) load();
    else if (r.error) window.alert(r.error);
  };

  return (
    <div className="min-h-dvh px-4 pt-4 pb-28 space-y-3">
      <TwaShell />
      <h1 className="text-lg font-bold gradient-text">Buyurtma</h1>
      {contractNumber && (
        <p className="text-[11px] text-cyan-200/90 font-mono mb-2">
          Shartnoma: <span className="text-white">{contractNumber}</span>
        </p>
      )}
      {clientIssueImageUrl && (
        <GlassCard className="p-4 space-y-2 border border-cyan-400/20">
          <p className="text-[11px] uppercase text-white/40">Mijoz yuborgan rasm</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={clientIssueImageUrl}
            alt="Mijoz"
            className="w-full max-h-64 rounded-xl object-contain border border-white/10 bg-black/30"
            referrerPolicy="no-referrer"
          />
        </GlassCard>
      )}
      {reqLine && (
        <GlassCard className="p-4 space-y-2 border border-white/10">
          <p className="text-[11px] uppercase text-white/40">Kelishuv</p>
          <p className="text-sm text-white/85">{reqLine}</p>
          <p className="text-xs text-white/60">
            Ko‘rsatilgan narx:{" "}
            <strong className="text-neon">{priceCents.toLocaleString()} so‘m</strong>
          </p>
          {workerPriceOk ? (
            <p className="text-xs text-emerald-300/90">Siz narxdan rozisiz (yozuv qayd etildi).</p>
          ) : (
            ["new", "accepted"].includes(status) &&
            priceCents > 0 && (
              <PrimaryButton
                className="!py-2 !text-xs w-full"
                disabled={confirmPriceBusy}
                onClick={() => void confirmAgreedPrice()}
              >
                {confirmPriceBusy ? "…" : "Telefonda kelishilgan narxdan roziman"}
              </PrimaryButton>
            )
          )}
        </GlassCard>
      )}
      <GlassCard className="p-4 space-y-2">
        <p className="text-sm text-white/80">Holat: {status}</p>
        <p className="text-xs text-white/55">
          Summa: <strong>{priceCents.toLocaleString()} so‘m</strong>
        </p>
        <p className="text-xs text-white/55">
          To‘lov: {PAYMENT_METHOD_UZ[paymentMethod] ?? paymentMethod} ·{" "}
          {PAYMENT_STATUS_UZ[paymentStatus] ?? paymentStatus}
        </p>
        {status === "completed" && !payoutReleased && (
          <p className="text-[11px] text-amber-200/85 leading-relaxed">
            Mijoz to‘lovni tasdiqlaguncha kuting (mini-ilovada «Pulni ustaga o‘tkazish»).
          </p>
        )}
        {status === "completed" && payoutReleased && (
          <p className="text-[11px] text-emerald-300/90">
            Mijoz to‘lovni tasdiqladi — summa hisobingizga o‘tkazildi.
          </p>
        )}
      </GlassCard>
      <PrimaryButton className="!py-2 !text-xs" variant="ghost" onClick={unlock}>
        Mijoz kontakti
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
