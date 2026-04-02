"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadWebApp } from "@/lib/twa";
import { apiJson } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { TwaShell } from "@/components/telegram/TwaShell";
import { motion, AnimatePresence } from "framer-motion";

type Me = {
  user: {
    id: string;
    role: "client" | "worker" | "admin";
    profileCompleted: boolean;
    pendingRole: string | null;
    workerProfileOk: boolean;
    onboardingStep: string;
  };
};

export function BootClient() {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "auth" | "route" | "err">("auth");
  const [msg, setMsg] = useState("");

  const go = useCallback(
    (m: Me) => {
      const { role, profileCompleted, workerProfileOk, onboardingStep } = m.user;
      if (role === "admin") {
        router.replace("/admin");
        return;
      }
      if (!profileCompleted || onboardingStep !== "done") {
        router.replace("/onboarding");
        return;
      }
      if (role === "worker" && !workerProfileOk) {
        router.replace("/onboarding");
        return;
      }
      router.replace(role === "worker" ? "/worker" : "/client/chat");
    },
    [router]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setPhase("auth");
        const WebApp = await loadWebApp();
        if (cancelled) return;
        const initData = WebApp.initData;
        if (!initData) {
          setPhase("err");
          setMsg("Ilovani Telegram ichidan oching (Mini App).");
          return;
        }
        const auth = await apiJson<{ ok?: boolean }>("/api/auth/telegram", {
          method: "POST",
          body: JSON.stringify({ initData }),
        });
        if (cancelled) return;
        if (!auth.ok) {
          setPhase("err");
          setMsg(auth.error || "Kirish muvaffaqiyatsiz");
          return;
        }
        const me = await apiJson<Me>("/api/me");
        if (cancelled) return;
        if (!me.ok || !me.data) {
          setPhase("err");
          setMsg(me.error || "Profil yuklanmadi");
          return;
        }
        setPhase("route");
        go(me.data);
      } catch (e) {
        if (!cancelled) {
          setPhase("err");
          setMsg(e instanceof Error ? e.message : "Noma'lum xato");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [go]);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-[#070a12] px-5 safe-pb">
      <TwaShell />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <GlassCard className="p-6">
          <h1 className="text-2xl font-bold gradient-text mb-1">Usta Call</h1>
          <p className="text-sm text-white/55 mb-6">
            AI dispetcher — muammoingizni yozing, eng yaxshi usta topiladi.
          </p>
          <AnimatePresence mode="wait">
            {phase === "auth" || phase === "route" ? (
              <motion.div
                key="load"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
                <p className="text-xs text-white/45 pt-2">Tizimga ulanmoqda…</p>
              </motion.div>
            ) : (
              <motion.div
                key="err"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
              >
                <p className="text-sm text-red-300/90">{msg || "Xatolik"}</p>
                <PrimaryButton onClick={() => window.location.reload()}>
                  Qayta urinish
                </PrimaryButton>
              </motion.div>
            )}
          </AnimatePresence>
        </GlassCard>
      </motion.div>
    </div>
  );
}
