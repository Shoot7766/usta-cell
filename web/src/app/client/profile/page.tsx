"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadWebApp } from "@/lib/twa";
import { apiJson } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TwaShell } from "@/components/telegram/TwaShell";

type Me = {
  user: {
    role: string;
    displayName: string | null;
    phone: string | null;
    profileCompleted: boolean;
  };
};

export default function ClientProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    void loadWebApp().then((WebApp) => {
      WebApp.BackButton.hide();
    });
  }, []);

  useEffect(() => {
    (async () => {
      const r = await apiJson<Me>("/api/me");
      if (r.ok && r.data) setMe(r.data);
    })();
  }, []);

  return (
    <div className="min-h-dvh px-4 pt-4 pb-28">
      <TwaShell />
      <h1 className="text-lg font-bold gradient-text mb-3">Profil</h1>
      {me && (
        <GlassCard className="p-4 mb-4 space-y-1">
          <p className="text-sm text-white">{me.user.displayName || "—"}</p>
          <p className="text-xs text-white/50">{me.user.phone || "—"}</p>
          <p className="text-xs text-white/45">
            Rol: <span className="text-neon">{me.user.role}</span>
          </p>
          <p className="text-xs text-white/45">
            Profil: {me.user.profileCompleted ? "to‘liq" : "to‘liq emas"}
          </p>
        </GlassCard>
      )}
      <PrimaryButton onClick={() => router.push("/onboarding")}>
        Rol va profil sozlamalari
      </PrimaryButton>
    </div>
  );
}
