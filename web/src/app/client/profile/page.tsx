"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { loadWebApp } from "@/lib/twa";
import { apiJson } from "@/lib/api-client";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TwaShell } from "@/components/telegram/TwaShell";
import { hapticSuccess } from "@/lib/haptic";

type Me = {
  user: {
    role: string;
    displayName: string | null;
    phone: string | null;
    profileCompleted: boolean;
    walletBalanceCents?: number;
  };
};

const PRESETS = [
  { label: "+50 000", cents: 50_000 },
  { label: "+100 000", cents: 100_000 },
  { label: "+500 000", cents: 500_000 },
];

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

function formatSoM(cents: number) {
  return cents.toLocaleString("uz-UZ");
}

export default function ClientProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [depLoading, setDepLoading] = useState(false);
  const [tgAvatarUrl, setTgAvatarUrl] = useState<string | null>(null);

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
    if (r.ok && r.data) setMe(r.data);
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

  const deposit = async (amountCents: number) => {
    setDepLoading(true);
    const r = await apiJson<{ walletBalanceCents: number }>("/api/wallet/deposit", {
      method: "POST",
      body: JSON.stringify({ amountCents }),
    });
    setDepLoading(false);
    if (r.ok && r.data) {
      hapticSuccess();
      setMe((prev) =>
        prev
          ? {
              ...prev,
              user: {
                ...prev.user,
                walletBalanceCents: r.data!.walletBalanceCents,
              },
            }
          : prev
      );
    }
  };

  const bal = me?.user.walletBalanceCents ?? 0;
  const roleUz =
    me?.user.role === "worker"
      ? "Usta"
      : me?.user.role === "admin"
        ? "Admin"
        : "Mijoz";

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

      <header className="relative mb-6 pt-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">
          Hisobingiz
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight gradient-text">Profil</h1>
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
              {me.user.displayName || "Ism ko‘rsatilmagan"}
            </h2>
            <span className="mt-1.5 inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-3 py-0.5 text-[11px] font-medium text-cyan-200/90">
              {roleUz}
            </span>
            <p className="mt-2 max-w-xs text-[11px] leading-relaxed text-white/40">
              {tgAvatarUrl
                ? "Rasm Telegram profilidan olinadi"
                : "Telegramda rasm yo‘q yoki brauzerda ko‘rinmaydi"}
            </p>
          </motion.div>

          <motion.div variants={fadeUp}>
            <div className="glass-panel neon-ring overflow-hidden rounded-2xl">
              <div className="h-1 w-full bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-amber-300 opacity-90" />
              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                      Hamyon
                    </p>
                    <p className="mt-1 text-3xl font-bold tabular-nums text-neon">
                      {formatSoM(bal)}{" "}
                      <span className="text-base font-semibold text-white/50">so‘m</span>
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] text-white/35">
                    Demo
                  </div>
                </div>
                <p className="text-[11px] leading-relaxed text-white/45">
                  Ish tugagach, yakunlangan buyurtmada «Pulni o‘tkazish» orqali kelishuv summasini
                  ustaga yuborasiz. Oldindan balansni to‘ldiring.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {PRESETS.map((p) => (
                    <motion.button
                      key={p.cents}
                      type="button"
                      disabled={depLoading}
                      whileTap={{ scale: 0.96 }}
                      className="rounded-xl border border-white/15 bg-gradient-to-b from-white/[0.14] to-white/[0.05] px-3.5 py-2 text-xs font-medium text-white shadow-sm shadow-black/20 disabled:opacity-45"
                      onClick={() => void deposit(p.cents)}
                    >
                      {p.label}
                    </motion.button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div variants={fadeUp}>
            <div className="glass-panel rounded-2xl p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Aloqa
              </p>
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-white/60">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M6.6 3.2c-.5 0-.9.2-1.2.5L3.8 5.3c-.6.6-.8 1.5-.4 2.3 1.8 3.6 4.8 6.6 8.4 8.4.8.4 1.7.2 2.3-.4l1.6-1.6c.4-.4.5-1 .2-1.5l-1.2-2c-.3-.5-.9-.7-1.4-.5l-1 .4c-.4.1-.8 0-1.1-.3-.9-.9-1.7-1.9-2.4-3-.2-.3-.2-.7 0-1l.4-1c.2-.5 0-1.1-.5-1.4l-2-1.2c-.2-.1-.4-.2-.6-.2z"
                      fill="currentColor"
                    />
                  </svg>
                </span>
                <p className="min-w-0 truncate text-sm text-white/85">{me.user.phone || "—"}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-3">
                <span className="rounded-lg bg-white/[0.06] px-2.5 py-1 text-[10px] text-white/50">
                  Profil:{" "}
                  <span className="text-white/75">
                    {me.user.profileCompleted ? "to‘liq" : "to‘liq emas"}
                  </span>
                </span>
              </div>
            </div>
          </motion.div>

          <motion.div variants={fadeUp}>
            <PrimaryButton onClick={() => router.push("/onboarding")}>
              Rol va profil sozlamalari
            </PrimaryButton>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
