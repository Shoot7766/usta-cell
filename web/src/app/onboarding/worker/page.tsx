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
  workerProfile?: {
    services: string[];
    lat: number | null;
    lng: number | null;
    priceMinCents: number;
    priceMaxCents: number;
  } | null;
};

export default function OnboardingWorkerPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [services, setServices] = useState("Elektrik, Santexnika");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [pMin, setPMin] = useState("50000");
  const [pMax, setPMax] = useState("500000");
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
      const wp = r.data.workerProfile;
      if (wp?.services?.length) {
        setServices(wp.services.join(", "));
      }
      if (wp?.lat != null) setLat(String(wp.lat));
      if (wp?.lng != null) setLng(String(wp.lng));
      if (wp?.priceMinCents != null && wp.priceMinCents > 0) {
        setPMin(String(wp.priceMinCents));
      }
      if (wp?.priceMaxCents != null && wp.priceMaxCents > 0) {
        setPMax(String(wp.priceMaxCents));
      }
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
        services: services.split(",").map((s) => s.trim()).filter(Boolean),
        lat: parseFloat(lat || "41.31"),
        lng: parseFloat(lng || "69.24"),
        priceMinCents: parseInt(pMin, 10) || 0,
        priceMaxCents: parseInt(pMax, 10) || 0,
        isAvailable: true,
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
          Xizmatlar, joylashuv va narx oralig‘ini to‘liq kiriting — shundan keyin
          buyurtmalar ochiladi.
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
        </GlassCard>

        <GlassCard className="p-4 mb-4 space-y-3">
          <p className="text-xs text-white/45 uppercase tracking-wider">
            Ish rejasi
          </p>
          <input
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
            placeholder="Xizmatlar (vergul bilan)"
            value={services}
            onChange={(e) => setServices(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
              placeholder="Kenglik (lat)"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
            />
            <input
              className="rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
              placeholder="Uzunlik (lng)"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
              placeholder="Min narx (so‘m)"
              value={pMin}
              onChange={(e) => setPMin(e.target.value)}
            />
            <input
              className="rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
              placeholder="Max narx (so‘m)"
              value={pMax}
              onChange={(e) => setPMax(e.target.value)}
            />
          </div>
          <PrimaryButton disabled={saving} onClick={() => void saveWorker()}>
            {saving ? "Saqlanmoqda…" : "Saqlash va davom etish"}
          </PrimaryButton>
        </GlassCard>
      </motion.div>
    </div>
  );
}
