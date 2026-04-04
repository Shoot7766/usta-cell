"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { loadWebApp } from "@/lib/twa";
import { apiJson } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TwaShell } from "@/components/telegram/TwaShell";
import { haptic, hapticSuccess, hapticError } from "@/lib/haptic";
import { useI18n } from "@/lib/i18n";
import { ORDER_ACCEPT_FEE_CENTS } from "@/lib/constants";
export default function WorkerOrderPage() {
  const { t, lang } = useI18n();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [status, setStatus] = useState("new");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [clientIssueImageUrl, setClientIssueImageUrl] = useState<string | null>(null);
  const [clientJobText, setClientJobText] = useState("");
  const [clientJobImageCaption, setClientJobImageCaption] = useState<string | null>(null);
  const [decisionDeadlineAt, setDecisionDeadlineAt] = useState<string | null>(null);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [clientPhone, setClientPhone] = useState<string | null>(null);
  const [clientUsername, setClientUsername] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadWebApp().then((WebApp) => {
      if (cancelled) return;
      WebApp.BackButton.show();
      WebApp.BackButton.onClick(() => {
        haptic.impact("light");
        router.push("/worker/orders");
      });
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
        client_issue_image_url?: string | null;
        client_job_text?: string | null;
        client_job_image_caption?: string | null;
        worker_decision_deadline_at?: string | null;
        client?: {
          display_name?: string | null;
          phone?: string | null;
          username?: string | null;
        } | null;
        requests?: { summary?: string | null; category?: string | null } | null;
      };
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
      const un = cl?.username?.trim();
      setClientUsername(un && !un.startsWith("@") ? `@${un}` : un || null);
      const imgUrl = r.data.order.client_issue_image_url;
      setClientIssueImageUrl(
        typeof imgUrl === "string" && imgUrl.startsWith("http") ? imgUrl : null
      );
      const jt = r.data.order.client_job_text;
      setClientJobText(typeof jt === "string" ? jt.trim() : "");
      const cap = r.data.order.client_job_image_caption;
      setClientJobImageCaption(typeof cap === "string" && cap.trim() ? cap.trim() : null);
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
          order?: { status?: string; worker_decision_deadline_at?: string | null };
        };
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
      hapticSuccess();
      const feeStr = ORDER_ACCEPT_FEE_CENTS.toLocaleString();
      const msg = lang === "ru" 
        ? `Заказ принят. Если лимит бесплатных приемов исчерпан, с баланса будет списано ${feeStr} ${t("sum_currency")}.`
        : `Buyurtma qabul qilindi. Bepul qabul limiti tugagan bo‘lsa, hisobdan qabul haqi (${feeStr} ${t("sum_currency")}) yechiladi.`;
      WebApp.showAlert(msg);
    } else if (!r.ok && r.error) {
      hapticError();
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
    hapticSuccess();
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
      hapticSuccess();
      WebApp.showAlert("Rad etildi. Tarixda qoldi; so‘rov yana bozorga qaytdi.");
      router.push("/worker");
      return;
    }
    if (!r.ok && r.error) WebApp.showAlert(r.error);
    load();
  };

  return (
    <div className="min-h-dvh px-4 pt-4 pb-28 space-y-3">
      <TwaShell />
      <h1 className="text-lg font-bold gradient-text">{t("order")}</h1>
      {clientJobText ? (
        <GlassCard className="p-4 space-y-2 border border-white/10">
          <p className="text-[11px] uppercase text-white/40">{t("client_said")}</p>
          <p className="text-sm text-white/90 whitespace-pre-wrap break-words leading-relaxed">
            {clientJobText}
          </p>
        </GlassCard>
      ) : null}
      {clientIssueImageUrl && (
        <GlassCard className="p-4 space-y-2 border border-cyan-400/20">
          <p className="text-[11px] uppercase text-white/40">{t("client_image")}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={clientIssueImageUrl}
            alt="Mijoz"
            className="w-full max-h-64 rounded-xl object-contain border border-white/10 bg-black/30"
            referrerPolicy="no-referrer"
          />
          {clientJobImageCaption &&
            clientJobText.trim() !== clientJobImageCaption.trim() &&
            !clientJobText.includes(clientJobImageCaption.trim()) && (
              <p className="text-xs text-white/80 whitespace-pre-wrap break-words">
                {clientJobImageCaption}
              </p>
            )}
        </GlassCard>
      )}
      {status === "pending_worker" && (
        <GlassCard className="p-4 space-y-3 border border-fuchsia-400/25">
          <p className="text-[11px] uppercase text-fuchsia-200/80">{t("status_pending_worker")}</p>
          <p className="text-xs text-white/70 leading-relaxed">
            {t("pending_worker_hint")}
          </p>
          {remainingSec != null && (
            <p className="text-sm font-mono text-cyan-200/90">
              {t("remaining_time")}: {String(Math.floor(remainingSec / 60)).padStart(2, "0")}:
              {String(remainingSec % 60).padStart(2, "0")}
            </p>
          )}
          {(clientName || clientPhone || clientUsername) && (
            <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 space-y-1">
              <p className="text-[10px] uppercase text-white/40">{t("client")}</p>
              {clientName && <p className="text-sm text-white/90">{clientName}</p>}
              {clientUsername && (
                <p className="text-sm text-white/85 font-mono">Telegram: {clientUsername}</p>
              )}
              {clientPhone && (
                <a href={`tel:${clientPhone}`} className="text-sm text-cyan-300 underline">
                  {clientPhone}
                </a>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <PrimaryButton className="!py-2 !text-xs" onClick={() => {
                haptic.impact("medium");
                void setSt("accepted");
            }}>
              {t("accept")}
            </PrimaryButton>
            <PrimaryButton className="!py-2 !text-xs" variant="ghost" onClick={() => {
                haptic.impact("medium");
                void cancel();
            }}>
              {t("reject")}
            </PrimaryButton>
          </div>
        </GlassCard>
      )}
      <GlassCard className="p-4 space-y-2">
        <p className="text-sm text-white/80">
          {t("order_status")}:{" "}
          {status === "pending_worker"
            ? t("status_pending_worker")
            : status === "new"
              ? t("status_new")
              : status === "accepted"
                ? t("status_accepted")
                : status === "in_progress"
                  ? t("status_in_progress")
                  : status === "completed"
                    ? t("status_completed")
                    : status === "canceled"
                      ? t("status_canceled")
                      : status}
        </p>
      </GlassCard>
      {["accepted", "in_progress", "completed"].includes(status) &&
        (clientName || clientPhone || clientUsername) && (
          <GlassCard className="p-4 space-y-2 border border-white/10">
            <p className="text-[10px] uppercase text-white/40">{t("client")}</p>
            {clientName && <p className="text-sm text-white/90">{clientName}</p>}
            {clientUsername && (
              <p className="text-sm text-white/85 font-mono">Telegram: {clientUsername}</p>
            )}
            {clientPhone && (
              <a href={`tel:${clientPhone}`} className="text-sm text-cyan-300 underline">
                {clientPhone}
              </a>
            )}
          </GlassCard>
        )}
      {status === "new" && (
        <>
          <PrimaryButton className="!py-2 !text-xs" variant="ghost" onClick={() => {
              haptic.impact("medium");
              void unlock();
          }}>
            {t("client_contact")}
          </PrimaryButton>
          <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 space-y-1">
            <p className="text-[10px] uppercase text-white/40">{t("client")}</p>
            {clientName && <p className="text-sm text-white/90">{clientName}</p>}
            {clientUsername && (
              <p className="text-sm text-white/85 font-mono">Telegram: {clientUsername}</p>
            )}
            {clientPhone && (
              <a href={`tel:${clientPhone}`} className="text-sm text-cyan-300 underline">
                {clientPhone}
              </a>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <PrimaryButton className="!py-2 !text-xs" onClick={() => {
                haptic.impact("medium");
                void setSt("accepted");
            }}>
              {t("accept")}
            </PrimaryButton>
            <PrimaryButton className="!py-2 !text-xs" variant="ghost" onClick={() => {
                haptic.impact("medium");
                void cancel();
            }}>
              {t("reject")}
            </PrimaryButton>
          </div>
        </>
      )}
    </div>
  );
}
