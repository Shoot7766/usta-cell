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
  const [decisionDeadlineAt, setDecisionDeadlineAt] = useState<string | null>(null);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [clientPhone, setClientPhone] = useState<string | null>(null);
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
        worker_decision_deadline_at?: string | null;
        client?: { display_name?: string | null; phone?: string | null } | null;
        requests?: { summary?: string | null; category?: string | null } | null;
      };
      events: { event_type: string }[];
    }>(`/api/orders/${id}`);
    if (r.ok && r.data) {
      setStatus(r.data.order.status);
      setRequestId(r.data.order.request_id);
      const ddl = r.data.order.worker_decision_deadline_at;
      setDecisionDeadlineAt(typeof ddl === "string" && ddl ? ddl : null);
      const cl = r.data.order.client;
      setClientName(cl?.display_name?.trim() || null);
      const ph = cl?.phone?.trim();
      setClientPhone(ph || null);
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
    if (!decisionDeadlineAt || status !== "pending_worker") {
      setRemainingSec(null);
      return;
    }
    const tick = () => {
      const end = new Date(decisionDeadlineAt).getTime();
      setRemainingSec(Math.max(0, Math.floor((end - Date.now()) / 1000)));
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [decisionDeadlineAt, status]);

  useEffect(() => {
    if (status !== "pending_worker") return;
    const iv = setInterval(() => void load(), 6000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, id]);

  useEffect(() => {
    void load();
    const es = new EventSource(`/api/orders/${id}/stream`);
    esRef.current = es;
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as {
          order?: {
            payout_released?: boolean;
            status?: string;
            worker_decision_deadline_at?: string | null;
          };
        };
        if (typeof msg?.order?.payout_released === "boolean") {
          setPayoutReleased(msg.order.payout_released);
        }
        if (msg?.order?.status) setStatus(msg.order.status);
        const w = msg?.order?.worker_decision_deadline_at;
        if (typeof w === "string" && w) setDecisionDeadlineAt(w);
      } catch {
        /* */
      }
    };
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const setSt = async (s: "accepted" | "in_progress" | "completed") => {
    const wasPending = status === "pending_worker";
    const r = await apiJson(`/api/orders/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status: s }),
    });
    const WebApp = await loadWebApp();
    if (r.ok && wasPending && s === "accepted") {
      WebApp.showAlert(
        "Buyurtma qabul qilindi. Bepul qabul limiti tugagan bo‘lsa, hisobdan qabul haqi (10 000 so‘m) yechiladi."
      );
    } else if (!r.ok && r.error) {
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
    const wasP = status === "pending_worker";
    const r = await apiJson(`/api/orders/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ as: "worker" }),
    });
    const WebApp = await loadWebApp();
    if (r.ok && wasP) {
      WebApp.showAlert("Rad etildi. Tarixda qoldi; so‘rov yana bozorga qaytdi.");
      router.push("/worker");
      return;
    }
    if (!r.ok && r.error) WebApp.showAlert(r.error);
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
            ["new", "pending_worker", "accepted"].includes(status) &&
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
      {status === "pending_worker" && (
        <GlassCard className="p-4 space-y-3 border border-fuchsia-400/25">
          <p className="text-[11px] uppercase text-fuchsia-200/80">Bozordan band qilindi</p>
          <p className="text-xs text-white/70 leading-relaxed">
            Mijoz bilan gaplashib,{" "}
            <strong className="text-white/90">10 daqiqa ichida</strong> pastdagi tugmalar bilan
            tasdiqlang yoki rad eting. Muddat o‘tsa yoki javob bermasangiz, hisobdan{" "}
            <strong className="text-neon">10 000 so‘m</strong> jarima yechiladi va so‘rov bozorga
            qaytadi.
          </p>
          {remainingSec != null && (
            <p className="text-sm font-mono text-cyan-200/90">
              Qolgan vaqt: {String(Math.floor(remainingSec / 60)).padStart(2, "0")}:
              {String(remainingSec % 60).padStart(2, "0")}
            </p>
          )}
          {(clientName || clientPhone) && (
            <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 space-y-1">
              <p className="text-[10px] uppercase text-white/40">Mijoz</p>
              {clientName && <p className="text-sm text-white/90">{clientName}</p>}
              {clientPhone && (
                <a href={`tel:${clientPhone}`} className="text-sm text-cyan-300 underline">
                  {clientPhone}
                </a>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <PrimaryButton className="!py-2 !text-xs" onClick={() => void setSt("accepted")}>
              Tasdiqlash
            </PrimaryButton>
            <PrimaryButton className="!py-2 !text-xs" variant="ghost" onClick={() => void cancel()}>
              Rad etish
            </PrimaryButton>
          </div>
        </GlassCard>
      )}
      <GlassCard className="p-4 space-y-2">
        <p className="text-sm text-white/80">
          Holat:{" "}
          {status === "pending_worker"
            ? "Tasdiqlash kutilmoqda"
            : status === "new"
              ? "Yangi"
              : status === "accepted"
                ? "Qabul qilindi"
                : status === "in_progress"
                  ? "Ishlanmoqda"
                  : status === "completed"
                    ? "Yakunlandi"
                    : status === "canceled"
                      ? "Bekor / rad etilgan"
                      : status}
        </p>
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
      {status === "new" && (
        <PrimaryButton className="!py-2 !text-xs" variant="ghost" onClick={unlock}>
          Mijoz kontakti
        </PrimaryButton>
      )}
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
