"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadWebApp } from "@/lib/twa";
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
    onboardingStep: string;
    pendingRole: string | null;
  };
};

export default function OnboardingPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [services, setServices] = useState("Elektrik, Santexnika");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [pMin, setPMin] = useState("50000");
  const [pMax, setPMax] = useState("500000");
  const [confirmToken, setConfirmToken] = useState<string | null>(null);
  const [targetRole, setTargetRole] = useState<"client" | "worker" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadWebApp().then((WebApp) => {
      if (cancelled) return;
      WebApp.BackButton.show();
      WebApp.BackButton.onClick(() => router.push("/"));
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
      const initData = WebApp.initData;
      if (initData) {
        await apiJson("/api/auth/telegram", {
          method: "POST",
          body: JSON.stringify({ initData }),
        });
      }
      const r = await apiJson<Me>("/api/me");
      if (r.ok && r.data) setMe(r.data);
    })();
  }, []);

  const refresh = async () => {
    const r = await apiJson<Me>("/api/me");
    if (r.ok && r.data) setMe(r.data);
  };

  const saveBase = async () => {
    await apiJson("/api/user/profile", {
      method: "PATCH",
      body: JSON.stringify({
        displayName,
        phone,
      }),
    });
    await refresh();
  };

  const saveWorker = async () => {
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
    await refresh();
  };

  const requestSwitch = async (tr: "client" | "worker") => {
    const r = await apiJson<{ confirmToken?: string }>("/api/user/role-switch", {
      method: "POST",
      body: JSON.stringify({ targetRole: tr }),
    });
    if (r.ok && r.data && "confirmToken" in r.data) {
      setConfirmToken(String((r.data as { confirmToken: string }).confirmToken));
      setTargetRole(tr);
    }
  };

  const confirmSwitch = async () => {
    if (!confirmToken) return;
    await apiJson("/api/user/role-switch/confirm", {
      method: "POST",
      body: JSON.stringify({ confirmToken }),
    });
    setConfirmToken(null);
    setTargetRole(null);
    await refresh();
  };

  if (!me) {
    return (
      <div className="min-h-dvh p-5 flex items-center justify-center text-white/60">
        Yuklanmoqda…
      </div>
    );
  }

  const role = me.user.role;
  const needWorker = role === "worker" && !me.user.workerProfileOk;

  return (
    <div className="min-h-dvh px-4 pt-4 pb-28 safe-pb">
      <TwaShell />
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-bold gradient-text mb-1">Onboarding</h1>
        <p className="text-sm text-white/55 mb-4">
          Profil to‘liq bo‘lmasa, buyurtma berish yoki ish qabul qilish bloklanadi.
        </p>

        <GlassCard className="p-4 mb-4 space-y-3">
          <p className="text-xs text-white/45 uppercase tracking-wider">Rol</p>
          <p className="text-sm text-white/80">
            Joriy: <span className="text-neon font-semibold">{role}</span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-xl bg-white/5 border border-white/10 py-2 text-sm"
              onClick={() => requestSwitch("client")}
            >
              Mijozga o‘tish
            </button>
            <button
              type="button"
              className="flex-1 rounded-xl bg-white/5 border border-white/10 py-2 text-sm"
              onClick={() => requestSwitch("worker")}
            >
              Ustaga o‘tish
            </button>
          </div>
          {confirmToken && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-400/20 p-3 space-y-2">
              <p className="text-xs text-amber-100/90">
                <strong>Xavfsizlik</strong>: {targetRole} rolini tasdiqlaysizmi?
              </p>
              <PrimaryButton onClick={confirmSwitch}>Ha, tasdiqlayman</PrimaryButton>
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-4 mb-4 space-y-3">
          <p className="text-xs text-white/45 uppercase tracking-wider">Asosiy profil</p>
          <input
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-cyan-400/40"
            placeholder="Ism"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <input
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-cyan-400/40"
            placeholder="Telefon"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <PrimaryButton onClick={saveBase}>Saqlash</PrimaryButton>
        </GlassCard>

        {needWorker && (
          <GlassCard className="p-4 mb-4 space-y-3">
            <p className="text-xs text-white/45 uppercase tracking-wider">Usta profili</p>
            <input
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
              placeholder="Xizmatlar (vergul bilan)"
              value={services}
              onChange={(e) => setServices(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                className="rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
                placeholder="Lat"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
              />
              <input
                className="rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
                placeholder="Lng"
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
            <PrimaryButton onClick={saveWorker}>Usta profilini saqlash</PrimaryButton>
          </GlassCard>
        )}

        {me.user.profileCompleted &&
          (role !== "worker" || me.user.workerProfileOk) && (
            <PrimaryButton
              onClick={() =>
                router.replace(role === "worker" ? "/worker" : "/client/chat")
              }
            >
              Davom etish
            </PrimaryButton>
          )}
      </motion.div>
    </div>
  );
}
