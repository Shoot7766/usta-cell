"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadWebApp } from "@/lib/twa";
import { getSuggestedDisplayNameFromTelegram } from "@/lib/twa-profile";
import { getBestEffortLatLng } from "@/lib/geo";
import {
  buildWorkerProfilePatch,
  FALLBACK_REGION_LAT,
  FALLBACK_REGION_LNG,
} from "@/lib/worker-defaults";
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

export default function OnboardingWorkerPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const [pickedLat, setPickedLat] = useState<number | null>(null);
  const [pickedLng, setPickedLng] = useState<number | null>(null);

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

  const pickLocation = async () => {
    setLocLoading(true);
    try {
      const g = await getBestEffortLatLng();
      if (g) {
        setPickedLat(g.lat);
        setPickedLng(g.lng);
      } else {
        const WebApp = await loadWebApp();
        WebApp.showAlert("Joylashuv olinmadi. Ruxsat bering yoki keyinroq urinib ko‘ring.");
      }
    } finally {
      setLocLoading(false);
    }
  };

  const saveWorker = async () => {
    setSaving(true);
    try {
      const lat = pickedLat ?? FALLBACK_REGION_LAT;
      const lng = pickedLng ?? FALLBACK_REGION_LNG;
      await apiJson("/api/user/profile", {
        method: "PATCH",
        body: JSON.stringify({
          displayName,
          phone,
          ...buildWorkerProfilePatch(lat, lng),
        }),
      });
      const check = await apiJson<Me>("/api/me");
      if (check.ok && check.data?.user.workerProfileOk) {
        router.replace("/worker");
        return;
      }
      router.replace("/onboarding");
    } finally {
      setSaving(false);
    }
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
          Ism va telefonni tekshiring. Joylashuvni ulash tavsiya etiladi — moslashtirish
          aniqroq bo‘ladi; olinmasa zaxira nuqta ishlatiladi.
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
          <button
            type="button"
            disabled={locLoading}
            className="w-full rounded-xl bg-white/5 border border-white/10 py-2 text-sm disabled:opacity-50"
            onClick={() => void pickLocation()}
          >
            {locLoading ? "Joylashuv…" : "Joylashuvni ulash (Telegram / GPS)"}
          </button>
          {pickedLat != null && pickedLng != null && (
            <p className="text-[11px] text-cyan-200/80">
              Tanlangan: {pickedLat.toFixed(5)}, {pickedLng.toFixed(5)}
            </p>
          )}
          <PrimaryButton disabled={saving} onClick={() => void saveWorker()}>
            {saving ? "Saqlanmoqda…" : "Saqlash va davom etish"}
          </PrimaryButton>
        </GlassCard>
      </motion.div>
    </div>
  );
}
