"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { loadWebApp } from "@/lib/twa";
import { apiJson } from "@/lib/api-client";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TwaShell } from "@/components/telegram/TwaShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { ProfileExitDoor } from "@/components/ui/ProfileExitDoor";
import { haptic, hapticSuccess, hapticError } from "@/lib/haptic";
import { useI18n } from "@/lib/i18n";

type Me = {
  user: {
    role: string;
    displayName: string | null;
    phone: string | null;
    profileCompleted: boolean;
  };
};

const stagger = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.07, delayChildren: 0.05 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
  },
};

export default function ClientProfilePage() {
  const { t } = useI18n();
  const [me, setMe] = useState<Me | null>(null);
  const [tgAvatarUrl, setTgAvatarUrl] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [requestingPhone, setRequestingPhone] = useState(false);

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
        setRequestingPhone(false);
        return;
      }
      wa.onEvent?.("contactRequested", (data: unknown) => {
        const d = data as { status?: string; response?: { phone_number?: string } };
        if (d?.status === "sent" && d?.response?.phone_number) {
          setEditPhone(d.response.phone_number);
        }
        setRequestingPhone(false);
      });
      wa.requestContact(() => { setRequestingPhone(false); });
    } catch {
      setRequestingPhone(false);
    }
  };

  useEffect(() => {
    void loadWebApp().then((WebApp) => {
      WebApp.BackButton.hide();
      const u = WebApp.initDataUnsafe?.user as { photo_url?: string } | undefined;
      if (u?.photo_url && typeof u.photo_url === "string") {
        setTgAvatarUrl(u.photo_url);
      }
    });
  }, []);

  const refresh = async () => {
    const r = await apiJson<Me>("/api/me");
    if (r.ok && r.data) {
      setMe(r.data);
      setEditName(r.data.user.displayName?.trim() ?? "");
      setEditPhone(r.data.user.phone?.trim() ?? "");
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const saveProfile = async () => {
    const WebApp = await loadWebApp();
    const name = editName.trim();
    if (name.length < 2) {
      hapticError();
      WebApp.showAlert(t("name_min_chars"));
      return;
    }
    setSaving(true);
    await apiJson("/api/user/profile", {
      method: "PATCH",
      body: JSON.stringify({
        displayName: name,
        phone: editPhone.trim() || undefined,
      }),
    });
    setSaving(false);
    hapticSuccess();
    WebApp.showAlert(t("profile_saved_toast"));
    await refresh();
  };

  const roleUz =
    me?.user.role === "worker"
      ? t("worker_role")
      : me?.user.role === "admin"
        ? t("role_admin")
        : t("client_role");

  return (
    <div className="relative min-h-dvh overflow-x-hidden px-4 pt-2 pb-28">
      <TwaShell />
      <div
        className="pointer-events-none absolute -top-24 right-[-20%] h-64 w-64 rounded-full bg-cyan-500/[0.12] blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute top-40 left-[-25%] h-56 w-56 rounded-full bg-fuchsia-500/[0.1] blur-3xl"
        aria-hidden
      />

      <header className="relative mb-6 pt-2 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">
            {t("your_account")}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight gradient-text">{t("portfolio")}</h1>
        </div>
        <ProfileExitDoor className="shrink-0 mt-0.5" />
      </header>

      {!me && (
        <div className="space-y-4">
          <div className="glass-panel h-36 animate-pulse rounded-2xl bg-white/[0.03]" />
          <div className="glass-panel h-44 animate-pulse rounded-2xl bg-white/[0.03]" />
        </div>
      )}

      {me && (
        <motion.div
          className="relative space-y-5"
          variants={stagger}
          initial="hidden"
          animate="show"
        >
          <motion.div variants={fadeUp} className="flex flex-col items-center text-center">
            <div className="relative">
              <div
                className="absolute -inset-1 rounded-full bg-gradient-to-tr from-cyan-400/50 via-fuchsia-500/40 to-amber-400/30 opacity-90 blur-[2px]"
                aria-hidden
              />
              <div className="relative rounded-full p-[3px] bg-gradient-to-br from-white/25 via-white/10 to-transparent">
                {tgAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={tgAvatarUrl}
                    alt=""
                    className="relative h-[5.5rem] w-[5.5rem] rounded-full object-cover ring-2 ring-[#070a12]"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="relative flex h-[5.5rem] w-[5.5rem] items-center justify-center rounded-full bg-gradient-to-br from-white/15 to-white/[0.04] text-2xl font-semibold text-white/50 ring-2 ring-[#070a12]">
                    {(me.user.displayName || "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
            </div>
            <h2 className="mt-4 max-w-[16rem] truncate text-lg font-semibold text-white">
              {me.user.displayName || t("no_worker_bio")}
            </h2>
            <span className="mt-1.5 inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-3 py-0.5 text-[11px] font-medium text-cyan-200/90">
              {roleUz}
            </span>
            <p className="mt-2 max-w-xs text-[11px] leading-relaxed text-white/40">
              {t("tg_avatar_hint")}
            </p>
          </motion.div>

          <motion.div variants={fadeUp}>
            <GlassCard className="p-4 space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                {t("profile_edit")}
              </p>
              <input
                className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
                placeholder={t("name_placeholder")}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
                  placeholder={t("phone_placeholder")}
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
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
              <PrimaryButton disabled={saving} onClick={() => {
                  haptic.impact("medium");
                  void saveProfile();
              }}>
                {saving ? t("saving") : t("save")}
              </PrimaryButton>
            </GlassCard>
          </motion.div>

        </motion.div>
      )}
    </div>
  );
}
