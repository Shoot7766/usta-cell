"use client";

import { useEffect, useState } from "react";
import { apiJson } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";

type D = {
  id: string;
  reason: string;
  status: string;
};

export default function AdminPage() {
  const [rows, setRows] = useState<D[]>([]);
  const [res, setRes] = useState("");

  useEffect(() => {
    (async () => {
      const r = await apiJson<{ disputes: D[] }>("/api/disputes");
      if (r.ok && r.data) setRows(r.data.disputes);
    })();
  }, []);

  const resolve = async (id: string) => {
    await apiJson(`/api/disputes/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ resolution: res || "Hal qilindi" }),
    });
    const r = await apiJson<{ disputes: D[] }>("/api/disputes");
    if (r.ok && r.data) setRows(r.data.disputes);
  };

  return (
    <div className="min-h-dvh px-4 pt-4 pb-10">
      <h1 className="text-lg font-bold gradient-text mb-3">Admin — nizolar</h1>
      <textarea
        className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm mb-3"
        placeholder="Yechim matni"
        value={res}
        onChange={(e) => setRes(e.target.value)}
      />
      <div className="space-y-3">
        {rows.map((d) => (
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
    </div>
  );
}
