"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadWebApp } from "@/lib/twa";
import { getSuggestedDisplayNameFromTelegram } from "@/lib/twa-profile";
import { apiJson } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TwaShell } from "@/components/telegram/TwaShell";
import { motion } from "framer-motion";

type Me = {
  user: {
    role: "client" | "worker" | "admin";
    profileCompleted: boolean;
    workerProfileOk: boolean;
    displayName?: string | null;
    phone?: string | null;
  };
};

/** Ish rejasi formasisiz: tizim standart usta parametrlarini yuboradi. */
const DEFAULT_WORKER_PATCH = {
  services: ["Umumiy ustachilik"],
  lat: 41.3111,
  lng: 69.2797,
  priceMinCents: 50_000,
  priceMaxCents: 500_000,
  isAvailable: true,
} as const;

export default function OnboardingWorkerPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadWebApp().then((WebApp) => {
      if (cancelled) return;
      WebApp.BackButton.show();
      WebApp.BackButton.onClick(() => router.push("/onboarding"));
    });
    return () => {
      cancelled = true;
      void loadWebApp().then((WebApp) => {
        WebApp.BackButton.hide();
      });
    };
  }, [router]);

  useEffect(() => {
    void (async () => {
      const WebApp = await loadWebApp();
      if (WebApp.initData) {
        await apiJson("/api/auth/telegram", {
          method: "POST",
          body: JSON.stringify({ initData: WebApp.initData }),
        });
      }
      const r = await apiJson<Me>("/api/me");
      if (!r.ok || !r.data) {
        router.replace("/");
        return;
      }
      if (r.data.user.role !== "worker") {
        router.replace("/onboarding");
        return;
      }
      const u = r.data.user;
      const suggested = await getSuggestedDisplayNameFromTelegram();
      if (u.displayName?.trim()) setDisplayName(u.displayName.trim());
      else if (suggested) setDisplayName(suggested);
      if (u.phone) setPhone(u.phone);
      setReady(true);
    })();
  }, [router]);

  const saveWorker = async () => {
    setSaving(true);
    await apiJson("/api/user/profile", {
      method: "PATCH",
      body: JSON.stringify({
        displayName,
        phone,
        ...DEFAULT_WORKER_PATCH,
      }),
    });
    setSaving(false);
    const check = await apiJson<Me>("/api/me");
    if (check.ok && check.data?.user.workerProfileOk) {
      router.replace("/worker");
      return;
    }
    router.replace("/onboarding");
  };

  if (!ready) {
    return (
      <div className="min-h-dvh p-5 flex items-center justify-center text-white/60">
        Yuklanmoqda…
      </div>
    );
  }

  return (
    <div className="min-h-dvh px-4 pt-4 pb-28 safe-pb">
      <TwaShell />
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-bold gradient-text mb-1">Usta profili</h1>
        <p className="text-sm text-white/55 mb-4">
          Ism va telefonni tekshiring. Joylashuv va narx oralig‘i tizimda standart
          qiymatlar bilan to‘ldiriladi.
        </p>

        <GlassCard className="p-4 mb-4 space-y-3">
          <p className="text-xs text-white/45 uppercase tracking-wider">
            Asosiy (usta)
          </p>
          <input
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
            placeholder="Ism"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <input
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
            placeholder="Telefon"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <PrimaryButton disabled={saving} onClick={() => void saveWorker()}>
            {saving ? "Saqlanmoqda…" : "Saqlash va davom etish"}
          </PrimaryButton>
        </GlassCard>
      </motion.div>
    </div>
  );
}
