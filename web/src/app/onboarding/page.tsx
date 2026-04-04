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
import { haptic, hapticSuccess } from "@/lib/haptic";
import { useI18n } from "@/lib/i18n";
import { GlassCard } from "@/components/ui/GlassCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TwaShell } from "@/components/telegram/TwaShell";
import { Skeleton } from "@/components/ui/Skeleton";
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
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [roleLoading, setRoleLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [requestingPhone, setRequestingPhone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadWebApp().then((WebApp) => {
      if (cancelled) return;
      WebApp.BackButton.show();
      WebApp.BackButton.onClick(() => {
        haptic.impact("light");
        router.push("/");
      });
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

  const saveBase = async () => {
    setSaveLoading(true);
    try {
      let workerDefaults: Record<string, unknown> = {};
      if (me?.user.role === "worker" && !me.user.workerProfileOk) {
        const g = await getBestEffortLatLng();
        const lat = g?.lat ?? FALLBACK_REGION_LAT;
        const lng = g?.lng ?? FALLBACK_REGION_LNG;
        workerDefaults = buildWorkerProfilePatch(lat, lng);
      }
      await apiJson("/api/user/profile", {
        method: "PATCH",
        body: JSON.stringify({
          displayName,
          phone,
          ...workerDefaults,
        }),
      });
      await refresh();
    } finally {
      setSaveLoading(false);
    }
  };

  const requestTelegramPhone = async () => {
    setRequestingPhone(true);
    try {
      const WebApp = await loadWebApp();
      const wa = WebApp as unknown as {
        requestContact?: (cb: (ok: boolean) => void) => void;
        onEvent?: (event: string, cb: (data: unknown) => void) => void;
      };
      if (!wa.requestContact) {
        WebApp.showAlert("Telegram'dan raqam olib bo'lmadi. Qo'lda kiriting.");
        return;
      }
      wa.onEvent?.("contactRequested", (data: unknown) => {
        const d = data as { status?: string; response?: { phone_number?: string } };
        if (d?.status === "sent" && d?.response?.phone_number) {
          setPhone(d.response.phone_number);
        }
        setRequestingPhone(false);
      });
      wa.requestContact(() => {
        setRequestingPhone(false);
      });
    } catch {
      setRequestingPhone(false);
    }
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
      hapticSuccess();
      await apiJson("/api/auth/sync-session", { method: "POST" });
      if (typeof window !== "undefined") window.location.reload();
      return;
    }
    const WebApp = await loadWebApp();
    WebApp.showAlert(r.error || t("auth_failed"));
  };

  const handleContinue = () => {
    if (!me) return;
    haptic.impact("medium");
    router.replace(me.user.role === "worker" ? "/worker" : "/client/chat");
  };

  useEffect(() => {
    const show =
      me?.user.profileCompleted &&
      (me.user.role !== "worker" || me.user.workerProfileOk);
    
    void loadWebApp().then((WebApp) => {
      if (show) {
        WebApp.MainButton.setText(t("continue"));
        WebApp.MainButton.show();
        WebApp.MainButton.onClick(handleContinue);
      } else {
        WebApp.MainButton.hide();
      }
    });

    return () => {
      void loadWebApp().then((WebApp) => {
        WebApp.MainButton.offClick(handleContinue);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, t]);

  if (!me) {
    return (
      <div className="min-h-dvh p-5 space-y-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const role = me.user.role;

  return (
    <div className="min-h-dvh px-4 pt-4 pb-28 safe-pb">
      <TwaShell />
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <header className="flex justify-between items-start mb-1">
          <h1 className="text-xl font-bold gradient-text">{t("onboarding_title")}</h1>
          <button
            onClick={() => {
              haptic.selection();
              setLang(lang === "uz" ? "ru" : "uz");
            }}
            className="text-[10px] px-2 py-1 rounded-lg bg-white/5 border border-white/10 uppercase"
          >
            {lang === "uz" ? "O'zb" : "Рус"}
          </button>
        </header>
        <p className="text-sm text-white/55 mb-4">
          {t("onboarding_hint")}
        </p>

        <GlassCard className="p-4 mb-4 space-y-3">
          <p className="text-xs text-white/45 uppercase tracking-wider">{t("role_label")}</p>
          <div className="flex gap-2">
            <motion.button
              type="button"
              disabled={roleLoading}
              initial={false}
              animate={{
                opacity: roleLoading ? 0.45 : role === "client" ? 1 : 0.38,
                scale: role === "client" ? 1 : 0.96,
              }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className={`flex-1 rounded-xl py-2.5 text-sm font-semibold border transition-colors duration-200 ${
                role === "client"
                  ? "border-cyan-400/45 bg-gradient-to-br from-cyan-500/25 to-fuchsia-500/10 text-white shadow-[0_0_24px_-10px_rgba(34,211,238,0.55)]"
                  : "border-white/[0.07] bg-black/45 text-white/45"
              }`}
              onClick={() => {
                haptic.impact("medium");
                void switchRole("client");
              }}
            >
              {t("client_role")}
            </motion.button>
            <motion.button
              type="button"
              disabled={roleLoading}
              initial={false}
              animate={{
                opacity: roleLoading ? 0.45 : role === "worker" ? 1 : 0.38,
                scale: role === "worker" ? 1 : 0.96,
              }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className={`flex-1 rounded-xl py-2.5 text-sm font-semibold border transition-colors duration-200 ${
                role === "worker"
                  ? "border-fuchsia-400/45 bg-gradient-to-br from-fuchsia-500/25 to-cyan-500/10 text-white shadow-[0_0_24px_-10px_rgba(217,70,239,0.5)]"
                  : "border-white/[0.07] bg-black/45 text-white/45"
              }`}
              onClick={() => {
                haptic.impact("heavy");
                void switchRole("worker");
              }}
            >
              {t("worker_role")}
            </motion.button>
          </div>
        </GlassCard>

        <GlassCard className="p-4 mb-4 space-y-3">
          <p className="text-xs text-white/45 uppercase tracking-wider">{t("profile_label")}</p>
          <input
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-cyan-400/40"
            placeholder={t("name_placeholder")}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-cyan-400/40"
              placeholder={t("phone_placeholder")}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <button
              type="button"
              disabled={requestingPhone}
              onClick={() => { haptic.impact("light"); void requestTelegramPhone(); }}
              className="shrink-0 rounded-xl bg-blue-500/20 border border-blue-400/30 px-3 py-2 text-xs text-blue-200 disabled:opacity-40"
            >
              {requestingPhone ? "…" : "📱 TG"}
            </button>
          </div>
          <p className="text-[11px] text-white/40">
            {t("onboarding_info")}
          </p>
          <PrimaryButton
            disabled={saveLoading}
            onClick={() => {
              haptic.impact("medium");
              void saveBase();
            }}
          >
            {saveLoading ? t("checking_loc") : t("save_changes")}
          </PrimaryButton>
        </GlassCard>

        {/* MainButton replaces this, keep empty or small hint for non-TWA */}
        {me.user.profileCompleted && (role !== "worker" || me.user.workerProfileOk) && (
          <p className="text-[10px] text-center text-white/30 italic">
            Telegram &quot;{t("continue")}&quot; tugmasini bosing
          </p>
        )}
      </motion.div>
    </div>
  );
}
