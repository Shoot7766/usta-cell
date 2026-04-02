"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { loadWebApp } from "@/lib/twa";
import { apiJson } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TwaShell } from "@/components/telegram/TwaShell";
import { motion } from "framer-motion";
import { hapticSuccess } from "@/lib/haptic";
import { PAYMENT_METHOD_UZ, PAYMENT_STATUS_UZ } from "@/lib/payment-labels";

const steps = [
  { key: "new", label: "Yangi" },
  { key: "accepted", label: "Qabul qilindi" },
  { key: "in_progress", label: "Ishlanmoqda" },
  { key: "completed", label: "Yakunlandi" },
];

type OrderPayload = {
  status: string;
  price_cents?: number;
  payment_method?: string;
  payment_status?: string;
  payout_released?: boolean;
  requests?: { summary?: string | null; category?: string | null } | null;
};

export default function ClientOrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<string>("new");
  const [priceCents, setPriceCents] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [paymentStatus, setPaymentStatus] = useState<string>("pending");
  const [events, setEvents] = useState<{ event_type: string; created_at: string }[]>(
    []
  );
  const [review, setReview] = useState({ rating: 5, comment: "" });
  const [paySaving, setPaySaving] = useState(false);
  const [payoutReleased, setPayoutReleased] = useState(false);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [reqLine, setReqLine] = useState("");
  const [priceEdit, setPriceEdit] = useState("");
  const [priceSaving, setPriceSaving] = useState(false);
  const [workerConfirmedPrice, setWorkerConfirmedPrice] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadWebApp().then((WebApp) => {
      if (cancelled) return;
      WebApp.BackButton.show();
      WebApp.BackButton.onClick(() => router.push("/client/orders"));
    });
    return () => {
      cancelled = true;
      void loadWebApp().then((WebApp) => {
        WebApp.BackButton.hide();
      });
    };
  }, [router]);

  const applyOrder = (o: OrderPayload | null | undefined) => {
    if (!o) return;
    if (o.status) setStatus(o.status);
    if (typeof o.price_cents === "number") {
      setPriceCents(o.price_cents);
      setPriceEdit(String(o.price_cents));
    }
    if (o.payment_method) setPaymentMethod(o.payment_method);
    if (o.payment_status) setPaymentStatus(o.payment_status);
    if (typeof o.payout_released === "boolean") setPayoutReleased(o.payout_released);
    const rq = o.requests;
    if (rq && (rq.summary || rq.category)) {
      setReqLine(
        [rq.category, rq.summary].filter(Boolean).join(" — ")
      );
    }
  };

  const load = async () => {
    const r = await apiJson<{
      order: OrderPayload;
      events: { event_type: string; created_at: string }[];
    }>(`/api/orders/${id}`);
    if (r.ok && r.data) {
      applyOrder(r.data.order);
      setEvents(r.data.events);
      setWorkerConfirmedPrice(
        r.data.events.some((e) => e.event_type === "worker_confirmed_agreed_price")
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
          order?: OrderPayload;
          events?: { event_type: string; created_at: string }[];
        };
        applyOrder(msg?.order);
        if (msg?.events) {
          setEvents(msg.events);
          setWorkerConfirmedPrice(
            msg.events.some((e) => e.event_type === "worker_confirmed_agreed_price")
          );
        }
      } catch {
        /* */
      }
    };
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load stable per id
  }, [id]);

  const savePaymentMethod = async (m: string) => {
    if (status === "canceled" || status === "completed") return;
    setPaySaving(true);
    await apiJson(`/api/orders/${id}/payment`, {
      method: "PATCH",
      body: JSON.stringify({ paymentMethod: m }),
    });
    setPaySaving(false);
    load();
  };

  const cancel = async () => {
    await apiJson(`/api/orders/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ as: "client" }),
    });
    load();
  };

  const openDispute = async () => {
    const reason = window.prompt("Muammo sababi (kamida 10 belgi)") || "";
    if (reason.length < 10) return;
    await apiJson("/api/disputes", {
      method: "POST",
      body: JSON.stringify({ orderId: id, reason }),
    });
    await load();
  };

  const saveAgreedPrice = async () => {
    const n = parseInt(priceEdit.replace(/\s/g, ""), 10);
    if (!Number.isFinite(n) || n < 1) {
      window.alert("Narxni to‘g‘ri kiriting (butun so‘m).");
      return;
    }
    setPriceSaving(true);
    const r = await apiJson(`/api/orders/${id}/agreed-price`, {
      method: "PATCH",
      body: JSON.stringify({ priceCents: n }),
    });
    setPriceSaving(false);
    if (r.ok) {
      hapticSuccess();
      load();
    } else if (r.error) window.alert(r.error);
  };

  const releasePayout = async () => {
    setPayoutLoading(true);
    const r = await apiJson<{ ok?: boolean }>(`/api/orders/${id}/release-payout`, {
      method: "POST",
    });
    setPayoutLoading(false);
    if (r.ok) {
      hapticSuccess();
      setPayoutReleased(true);
      load();
    } else if (r.error) {
      window.alert(r.error);
    }
  };

  const sendReview = async () => {
    await apiJson("/api/reviews", {
      method: "POST",
      body: JSON.stringify({
        orderId: id,
        rating: review.rating,
        comment: review.comment,
      }),
    });
    hapticSuccess();
    load();
  };

  const idx = steps.findIndex((s) => s.key === status);

  return (
    <div className="min-h-dvh px-4 pt-4 pb-28">
      <TwaShell />
      <h1 className="text-lg font-bold gradient-text mb-3">Kuzatuv</h1>
      <GlassCard className="p-4 mb-4">
        <div className="flex justify-between gap-1">
          {steps.map((s, i) => (
            <div key={s.key} className="flex-1 text-center">
              <motion.div
                className={`mx-auto h-2 rounded-full mb-1 ${
                  i <= idx ? "bg-gradient-to-r from-cyan-400 to-fuchsia-500" : "bg-white/10"
                }`}
                initial={false}
                animate={{ opacity: 1 }}
              />
              <p className="text-[9px] text-white/50 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-white/45 mt-3">Holat: {status}</p>
      </GlassCard>

      {reqLine && (
        <GlassCard className="p-4 mb-4 space-y-2 border border-white/10">
          <p className="text-[11px] uppercase text-white/40">Qisqa kelishuv</p>
          <p className="text-sm text-white/85">{reqLine}</p>
          <p className="text-xs text-white/55">
            Kelishilgan narx:{" "}
            <span className="text-neon font-semibold">
              {priceCents.toLocaleString()} so‘m
            </span>
          </p>
          <p className="text-[10px] text-white/40 leading-relaxed">
            Tomonlar telefonda kelishgan. Usta «Narxdan roziman» tugmasini bosgach, bu narx
            yakuniy hisoblanadi. To‘lov ish bitgach hamyon orqali.
          </p>
          {workerConfirmedPrice && (
            <p className="text-xs text-emerald-300/90">Usta kelishilgan narxdan rozi.</p>
          )}
        </GlassCard>
      )}

      {["new", "accepted"].includes(status) && (
        <GlassCard className="p-4 mb-4 space-y-2">
          <p className="text-xs text-white/45 uppercase">Narxni yangilash</p>
          <p className="text-[11px] text-white/50">
            Telefonda kelishgach, bu yerga yozing (so‘m, butun son).
          </p>
          <input
            type="text"
            inputMode="numeric"
            className="w-full rounded-xl bg-black/35 border border-white/10 px-3 py-2 text-sm outline-none focus:border-cyan-400/40"
            value={priceEdit}
            onChange={(e) => setPriceEdit(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="Masalan: 350000"
          />
          <PrimaryButton
            className="!py-2 !text-xs"
            disabled={priceSaving}
            onClick={() => void saveAgreedPrice()}
          >
            {priceSaving ? "Saqlanmoqda…" : "Kelishilgan narxni saqlash"}
          </PrimaryButton>
        </GlassCard>
      )}

      <GlassCard className="p-4 mb-4 space-y-2">
        <p className="text-xs text-white/45 uppercase">To‘lov</p>
        <p className="text-sm text-white/85">
          Kelishuv bo‘yicha:{" "}
          <span className="text-neon font-semibold">
            {priceCents.toLocaleString()} so‘m
          </span>{" "}
          (yaxlitlash usta bilan)
        </p>
        <p className="text-xs text-white/55">
          Usul:{" "}
          <strong>{PAYMENT_METHOD_UZ[paymentMethod] ?? paymentMethod}</strong> · Holat:{" "}
          <strong>{PAYMENT_STATUS_UZ[paymentStatus] ?? paymentStatus}</strong>
        </p>
        <p className="text-[11px] text-white/40">
          Hamyon orqali to‘lov: ish tugagach, pastdagi tugma bilan kelishuv summasini ustaga
          o‘tkazing. Naqd/karta hali ham kelishuv bo‘yicha mumkin.
        </p>
        {status !== "canceled" && status !== "completed" && (
          <div className="flex flex-wrap gap-2 pt-1">
            {(["cash", "card", "transfer", "other"] as const).map((m) => (
              <button
                key={m}
                type="button"
                disabled={paySaving || paymentMethod === m}
                className={`rounded-lg px-2 py-1 text-[11px] border ${
                  paymentMethod === m
                    ? "border-cyan-400/50 bg-cyan-500/15"
                    : "border-white/10 bg-white/5 opacity-80"
                }`}
                onClick={() => void savePaymentMethod(m)}
              >
                {PAYMENT_METHOD_UZ[m]}
              </button>
            ))}
          </div>
        )}
      </GlassCard>

      <GlassCard className="p-4 mb-4 space-y-2">
        <p className="text-xs text-white/45 uppercase">Voqealar</p>
        {events.slice(-8).map((e) => (
          <div key={e.created_at + e.event_type} className="text-xs text-white/70">
            · {e.event_type}
          </div>
        ))}
      </GlassCard>

      {status === "new" && (
        <PrimaryButton variant="ghost" onClick={cancel}>
          Bekor qilish (qabuldan oldin bepul)
        </PrimaryButton>
      )}

      {["accepted", "in_progress"].includes(status) && (
        <PrimaryButton className="mt-3 !py-2 !text-xs" variant="ghost" onClick={openDispute}>
          Nizoni xabar qilish
        </PrimaryButton>
      )}

      {status === "completed" && !payoutReleased && priceCents > 0 && (
        <GlassCard className="p-4 mt-4 space-y-2 border border-amber-400/25">
          <p className="text-sm font-semibold text-amber-200/95">Hamyon orqali to‘lov</p>
          <p className="text-xs text-white/60">
            Ish tugaganini tasdiqlaysiz:{" "}
            <span className="text-neon font-medium">
              {priceCents.toLocaleString()} so‘m
            </span>{" "}
            hamyoningizdan yechiladi va ustaga o‘tkaziladi (komissiya hisobga olinadi).
          </p>
          <PrimaryButton
            disabled={payoutLoading}
            onClick={() => void releasePayout()}
          >
            {payoutLoading ? "Kutilmoqda…" : "Pulni ustaga o‘tkazish"}
          </PrimaryButton>
        </GlassCard>
      )}

      {status === "completed" && payoutReleased && (
        <p className="text-xs text-emerald-300/90 mt-2 px-1">
          To‘lov ustaga o‘tkazilgan.
        </p>
      )}

      {status === "completed" && (
        <GlassCard className="p-4 mt-4 space-y-2">
          <p className="text-sm font-semibold">Baholang</p>
          <input
            type="range"
            min={1}
            max={5}
            value={review.rating}
            onChange={(e) =>
              setReview((r) => ({ ...r, rating: parseInt(e.target.value, 10) }))
            }
            className="w-full"
          />
          <textarea
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
            placeholder="Izoh (ixtiyoriy)"
            value={review.comment}
            onChange={(e) => setReview((r) => ({ ...r, comment: e.target.value }))}
          />
          <PrimaryButton onClick={sendReview}>Yuborish</PrimaryButton>
        </GlassCard>
      )}
    </div>
  );
}
