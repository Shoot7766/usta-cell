"use client";

import { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { loadWebApp } from "@/lib/twa";
import { apiJson } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TwaShell } from "@/components/telegram/TwaShell";
import { hapticSuccess } from "@/lib/haptic";
import { getBestEffortLatLng } from "@/lib/geo";
import { FALLBACK_REGION_LAT, FALLBACK_REGION_LNG } from "@/lib/worker-defaults";

const MiniMapPicker = dynamic(
  () => import("@/components/map/MiniMapPicker").then((m) => ({ default: m.MiniMapPicker })),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[200px] rounded-xl bg-white/5 border border-white/10 animate-pulse" />
    ),
  }
);

const holatUz: Record<string, string> = {
  pending_worker: "Usta so‘rovingizni band qildi — u tasdiqlaydi",
  new: "Yangi",
  accepted: "Qabul qilindi",
  in_progress: "Ishlanmoqda",
  completed: "Yakunlandi",
  canceled: "Bekor qilingan",
};

type OrderPayload = {
  status: string;
  request_id?: string;
  contract_number?: string;
  price_cents?: number;
  client_issue_image_url?: string | null;
  worker?: { display_name?: string | null } | null;
  requests?: {
    summary?: string | null;
    category?: string | null;
    address?: string | null;
    client_lat?: number | null;
    client_lng?: number | null;
  } | null;
};

export default function ClientOrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<string>("new");
  const [priceCents, setPriceCents] = useState<number>(0);
  const [review, setReview] = useState({ rating: 5, comment: "" });
  const [workerName, setWorkerName] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [requestSummary, setRequestSummary] = useState("");
  const [orderRequestId, setOrderRequestId] = useState<string | null>(null);
  const [pickLat, setPickLat] = useState(FALLBACK_REGION_LAT);
  const [pickLng, setPickLng] = useState(FALLBACK_REGION_LNG);
  const [addrLineOrder, setAddrLineOrder] = useState("");
  const [locBusy, setLocBusy] = useState(false);
  const [clientIssueImageUrl, setClientIssueImageUrl] = useState<string | null>(null);
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
    }
    const rq = o.requests;
    setWorkerName(o.worker?.display_name?.trim() || "");
    setContractAddress(rq?.address?.trim() ? String(rq.address) : "");
    if (typeof o.request_id === "string" && o.request_id) {
      setOrderRequestId(o.request_id);
    }
    if (rq && (rq.summary || rq.category)) {
      setRequestSummary([rq.category, rq.summary].filter(Boolean).join(" — "));
    } else {
      setRequestSummary("");
    }
    const ciu = o.client_issue_image_url;
    setClientIssueImageUrl(
      typeof ciu === "string" && ciu.startsWith("http") ? ciu : null
    );
    if (
      rq &&
      typeof rq.client_lat === "number" &&
      typeof rq.client_lng === "number" &&
      Number.isFinite(rq.client_lat) &&
      Number.isFinite(rq.client_lng)
    ) {
      setPickLat(rq.client_lat);
      setPickLng(rq.client_lng);
    }
    if (rq?.address?.trim()) {
      const first = String(rq.address).split(" · ")[0] ?? "";
      setAddrLineOrder((prev) => prev || first.slice(0, 420));
    }
  };

  const load = async () => {
    const r = await apiJson<{ order: OrderPayload }>(`/api/orders/${id}`);
    if (r.ok && r.data) {
      applyOrder(r.data.order);
    }
  };

  useEffect(() => {
    void load();
    const es = new EventSource(`/api/orders/${id}/stream`);
    esRef.current = es;
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as { order?: OrderPayload };
        applyOrder(msg?.order);
      } catch {
        /* */
      }
    };
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load stable per id
  }, [id]);

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

  const applyGpsOrderMap = async () => {
    setLocBusy(true);
    const g = await getBestEffortLatLng();
    setLocBusy(false);
    if (g) {
      setPickLat(g.lat);
      setPickLng(g.lng);
    } else {
      window.alert("GPS olinmadi. Xaritadan nuqtani tanlang.");
    }
  };

  const saveOrderLocation = async () => {
    if (!orderRequestId) return;
    setLocBusy(true);
    const manual = addrLineOrder.trim();
    const address = manual
      ? `${manual.slice(0, 420)} · ${pickLat.toFixed(5)}, ${pickLng.toFixed(5)}`.slice(0, 500)
      : `${pickLat.toFixed(5)}, ${pickLng.toFixed(5)} — xarita`;
    const r = await apiJson(`/api/requests/${orderRequestId}/location`, {
      method: "PATCH",
      body: JSON.stringify({ lat: pickLat, lng: pickLng, address }),
    });
    setLocBusy(false);
    if (r.ok) {
      hapticSuccess();
      load();
    } else if (r.error) window.alert(r.error);
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

  return (
    <div className="min-h-dvh px-4 pt-4 pb-28">
      <TwaShell />
      <h1 className="text-lg font-bold gradient-text mb-1">Buyurtma</h1>
      <GlassCard className="p-4 mb-4">
        <p className="text-xs text-white/45">
          Holat: {holatUz[status] ?? status}
        </p>
        {requestSummary.trim() && (
          <p className="text-xs text-white/75 mt-2 leading-relaxed">{requestSummary}</p>
        )}
        {workerName.trim() && (
          <p className="text-[11px] text-white/45 mt-2">Usta: {workerName}</p>
        )}
        {priceCents > 0 && (
          <p className="text-[11px] text-white/45 mt-1">
            Taxminiy narx:{" "}
            <span className="text-neon font-medium">{priceCents.toLocaleString()} so‘m</span>
          </p>
        )}
      </GlassCard>

      {clientIssueImageUrl && (
        <GlassCard className="p-4 mb-4 space-y-2 border border-white/10">
          <p className="text-[11px] uppercase text-white/40">Siz yuborgan rasm</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={clientIssueImageUrl}
            alt=""
            className="w-full max-h-64 rounded-xl object-contain border border-white/10 bg-black/30"
            referrerPolicy="no-referrer"
          />
        </GlassCard>
      )}

      {orderRequestId && !["canceled", "completed"].includes(status) && (
          <GlassCard className="p-4 mb-4 space-y-2 border border-cyan-400/15">
            <p className="text-xs text-white/45 uppercase">Manzil</p>
            <p className="text-[11px] text-white/50 leading-relaxed">
              Usta keladigan joyni xarita va matn bilan yuboring.
            </p>
            <MiniMapPicker
              lat={pickLat}
              lng={pickLng}
              onChange={(la, ln) => {
                setPickLat(la);
                setPickLng(ln);
              }}
            />
            <p className="text-[10px] text-white/35 font-mono">
              {pickLat.toFixed(5)}, {pickLng.toFixed(5)}
            </p>
            <input
              className="w-full rounded-xl bg-black/35 border border-white/10 px-3 py-2 text-sm outline-none focus:border-cyan-400/40"
              placeholder="Ko‘cha, uy, xonadon…"
              value={addrLineOrder}
              onChange={(e) => setAddrLineOrder(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={locBusy}
                className="rounded-xl bg-white/5 border border-white/10 py-2 text-xs disabled:opacity-50"
                onClick={() => void applyGpsOrderMap()}
              >
                {locBusy ? "…" : "GPS → xarita"}
              </button>
              <button
                type="button"
                disabled={locBusy}
                className="rounded-xl bg-white/5 border border-white/10 py-2 text-xs disabled:opacity-50"
                onClick={() => void saveOrderLocation()}
              >
                {locBusy ? "…" : "Manzilni saqlash"}
              </button>
            </div>
            {contractAddress && (
              <p className="text-[10px] text-emerald-300/85">Saqlangan: {contractAddress}</p>
            )}
          </GlassCard>
        )}

      {["new", "pending_worker"].includes(status) && (
        <PrimaryButton variant="ghost" onClick={cancel}>
          Bekor qilish (qabuldan oldin bepul)
        </PrimaryButton>
      )}

      {["accepted", "in_progress"].includes(status) && (
        <PrimaryButton className="mt-3 !py-2 !text-xs" variant="ghost" onClick={openDispute}>
          Nizoni xabar qilish
        </PrimaryButton>
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
