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
    onboardingStep: string;
    pendingRole: string | null;
    displayName?: string | null;
    phone?: string | null;
  };
};

export default function OnboardingPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [roleLoading, setRoleLoading] = useState(false);

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

  const refresh = async () => {
    const r = await apiJson<Me>("/api/me");
    if (r.ok && r.data) {
      setMe(r.data);
      const u = r.data.user;
      if (u.displayName) setDisplayName(u.displayName);
      if (u.phone) setPhone(u.phone);
    }
  };

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
      const suggested = await getSuggestedDisplayNameFromTelegram();
      if (r.ok && r.data) {
        setMe(r.data);
        const u = r.data.user;
        if (u.displayName?.trim()) {
          setDisplayName(u.displayName.trim());
        } else if (suggested) {
          setDisplayName(suggested);
        }
        if (u.phone) setPhone(u.phone);
        if (!u.displayName?.trim() && suggested) {
          await apiJson("/api/user/profile", {
            method: "PATCH",
            body: JSON.stringify({ displayName: suggested }),
          });
          await refresh();
        }
      } else if (suggested) {
        setDisplayName(suggested);
      }
    })();
  }, []);

  useEffect(() => {
    if (!me) return;
    if (me.user.role === "worker" && !me.user.workerProfileOk) {
      void router.replace("/onboarding/worker");
    }
  }, [me, router]);

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

  const switchRole = async (tr: "client" | "worker") => {
    if (roleLoading || me?.user.role === tr) return;
    setRoleLoading(true);
    const r = await apiJson<{ ok?: boolean; role?: string }>(
      "/api/user/role-switch",
      {
        method: "POST",
        body: JSON.stringify({ targetRole: tr }),
      }
    );
    setRoleLoading(false);
    if (r.ok) {
      await refresh();
      return;
    }
    const WebApp = await loadWebApp();
    WebApp.showAlert(r.error || "Rol almashmadi");
  };

  if (!me) {
    return (
      <div className="min-h-dvh p-5 flex items-center justify-center text-white/60">
        Yuklanmoqda…
      </div>
    );
  }

  const role = me.user.role;
  if (role === "worker" && !me.user.workerProfileOk) {
    return (
      <div className="min-h-dvh p-5 flex items-center justify-center text-white/60">
        Usta profili ochilmoqda…
      </div>
    );
  }

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
          <div className="flex gap-2">
            <button
              type="button"
              disabled={roleLoading || role === "client"}
              className="flex-1 rounded-xl bg-white/5 border border-white/10 py-2 text-sm disabled:opacity-40"
              onClick={() => void switchRole("client")}
            >
              Mijoz
            </button>
            <button
              type="button"
              disabled={roleLoading || role === "worker"}
              className="flex-1 rounded-xl bg-white/5 border border-white/10 py-2 text-sm disabled:opacity-40"
              onClick={() => void switchRole("worker")}
            >
              Usta
            </button>
          </div>
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
          <p className="text-[11px] text-white/40">
            Ism Telegramdan avtomatik keladi. Telefonni ilova ochilganda so‘ralgan bo‘lishi
            mumkin; yo‘q bo‘lsa, bu yerga qo‘lda yozing.
          </p>
          <PrimaryButton onClick={() => void saveBase()}>
            O‘zgarishlarni saqlash
          </PrimaryButton>
        </GlassCard>

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
