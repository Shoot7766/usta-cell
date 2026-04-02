"use client";

import { useCallback, useEffect, useState } from "react";
import { apiJson } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";

type DisputeRow = {
  id: string;
  reason: string;
  status: string;
};

type TopupRow = {
  id: string;
  worker_id: string;
  amount_cents: number;
  status: string;
  created_at: string;
  resolved_at: string | null;
  receipt_url?: string | null;
  worker_label?: string | null;
};

export default function AdminPage() {
  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [topups, setTopups] = useState<TopupRow[]>([]);
  const [res, setRes] = useState("");
  const [topupBusy, setTopupBusy] = useState<string | null>(null);

  const loadDisputes = useCallback(async () => {
    const r = await apiJson<{ disputes: DisputeRow[] }>("/api/disputes");
    if (r.ok && r.data) setDisputes(r.data.disputes);
  }, []);

  const loadTopups = useCallback(async () => {
    const r = await apiJson<{ requests: TopupRow[] }>("/api/admin/topup-requests");
    if (r.ok && r.data?.requests) setTopups(r.data.requests);
  }, []);

  useEffect(() => {
    void loadDisputes();
    void loadTopups();
  }, [loadDisputes, loadTopups]);

  const resolve = async (id: string) => {
    await apiJson(`/api/disputes/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ resolution: res || "Hal qilindi" }),
    });
    await loadDisputes();
  };

  const approveTopup = async (id: string) => {
    setTopupBusy(id);
    await apiJson(`/api/admin/topup-requests/${id}/approve`, { method: "POST" });
    setTopupBusy(null);
    await loadTopups();
  };

  return (
    <div className="min-h-dvh px-4 pt-4 pb-10 space-y-8">
      <section>
        <h1 className="text-lg font-bold gradient-text mb-3">Admin — usta to‘ldirish</h1>
        <p className="text-xs text-white/45 mb-3">
          Kutilayotgan so‘rovlarni tasdiqlang — pul usta qabul balansiga qo‘shiladi.
        </p>
        <div className="space-y-3">
          {topups.length === 0 && (
            <p className="text-sm text-white/40">So‘rovlar yo‘q yoki yuklanmadi.</p>
          )}
          {topups.map((t) => (
            <GlassCard key={t.id} className="p-4 space-y-2">
              <p className="text-xs text-white/45">{t.status}</p>
              <p className="text-sm text-white/90">
                {(t.amount_cents ?? 0).toLocaleString("uz-UZ")} so‘m
              </p>
              <p className="text-[11px] text-white/50">{t.worker_label ?? t.worker_id}</p>
              {t.receipt_url?.startsWith("http") && (
                <a
                  href={t.receipt_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-xs text-cyan-300 underline"
                >
                  Chekni ochish
                </a>
              )}
              <p className="text-[10px] text-white/35">
                {new Date(t.created_at).toLocaleString("uz-UZ")}
              </p>
              {t.status === "pending" && (
                <PrimaryButton
                  className="!py-2 !text-xs"
                  disabled={topupBusy === t.id}
                  onClick={() => void approveTopup(t.id)}
                >
                  {topupBusy === t.id ? "…" : "Tasdiqlash"}
                </PrimaryButton>
              )}
            </GlassCard>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-base font-bold gradient-text mb-3">Nizolar</h2>
        <textarea
          className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm mb-3"
          placeholder="Yechim matni"
          value={res}
          onChange={(e) => setRes(e.target.value)}
        />
        <div className="space-y-3">
          {disputes.map((d) => (
            <GlassCard key={d.id} className="p-4 space-y-2">
              <p className="text-xs text-white/45">{d.status}</p>
              <p className="text-sm">{d.reason}</p>
              {d.status === "open" && (
                <PrimaryButton className="!py-2 !text-xs" onClick={() => resolve(d.id)}>
                  Yechim kiritish
                </PrimaryButton>
              )}
            </GlassCard>
          ))}
        </div>
      </section>
    </div>
  );
}
