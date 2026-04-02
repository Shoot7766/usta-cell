"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadWebApp } from "@/lib/twa";
import { apiJson } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TwaShell } from "@/components/telegram/TwaShell";

export default function WorkerProfilePage() {
  const router = useRouter();
  const [tier, setTier] = useState<"free" | "pro">("free");

  useEffect(() => {
    void loadWebApp().then((WebApp) => {
      WebApp.BackButton.hide();
    });
  }, []);

  const sub = async (t: "free" | "pro") => {
    const r = await apiJson("/api/subscriptions", {
      method: "POST",
      body: JSON.stringify({ tier: t }),
    });
    if (r.ok) setTier(t);
  };

  return (
    <div className="min-h-dvh px-4 pt-4 pb-28">
      <TwaShell />
      <h1 className="text-lg font-bold gradient-text mb-3">Usta profili</h1>
      <GlassCard className="p-4 mb-3 space-y-2">
        <p className="text-xs text-white/45">Obuna (reyting ustuvorligi)</p>
        <p className="text-sm">Joriy: {tier}</p>
        <div className="grid grid-cols-2 gap-2">
          <PrimaryButton className="!py-2 !text-xs" onClick={() => sub("free")}>
            Free
          </PrimaryButton>
          <PrimaryButton className="!py-2 !text-xs" onClick={() => sub("pro")}>
            Pro
          </PrimaryButton>
        </div>
      </GlassCard>
      <PrimaryButton onClick={() => router.push("/onboarding/worker")}>
        Profilni tahrirlash
      </PrimaryButton>
    </div>
  );
}
