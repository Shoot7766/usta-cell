"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadWebApp } from "@/lib/twa";
import { apiJson } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
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

  return (
    <div className="min-h-dvh px-4 pt-4 pb-28">
      <TwaShell />
      <h1 className="text-lg font-bold gradient-text mb-3">Profil</h1>
      {me && (
        <>
          <GlassCard className="p-4 mb-4 space-y-2" glow>
            <p className="text-[11px] uppercase tracking-wider text-white/40">Hamyon</p>
            <p className="text-2xl font-bold text-neon tabular-nums">
              {bal.toLocaleString()} so‘m
            </p>
            <p className="text-[11px] text-white/45 leading-relaxed">
              Ish tugagach, yakunlangan buyurtmada «Pulni o‘tkazish» orqali kelishuv summasini
              ustaga yuborasiz. Oldindan balansni to‘ldiring (hozircha demo rejim).
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {PRESETS.map((p) => (
                <button
                  key={p.cents}
                  type="button"
                  disabled={depLoading}
                  className="rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-xs disabled:opacity-50"
                  onClick={() => void deposit(p.cents)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </GlassCard>
          <GlassCard className="p-4 mb-4 space-y-3">
            <div className="flex items-center gap-3">
              {tgAvatarUrl ? (
                // Telegram CDN — tashqi URL, next/image domen ro‘yxati talab qiladi
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={tgAvatarUrl}
                  alt=""
                  className="h-16 w-16 rounded-full object-cover border border-white/15 shrink-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="h-16 w-16 rounded-full bg-white/10 border border-white/15 shrink-0 flex items-center justify-center text-xl text-white/40">
                  {(me.user.displayName || "?").slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="space-y-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">
                  {me.user.displayName || "—"}
                </p>
                <p className="text-[10px] text-white/40">
                  {tgAvatarUrl ? "Telegram avatar" : "Avatar Telegramda yo‘q yoki brauzerda ko‘rinmaydi"}
                </p>
              </div>
            </div>
            <p className="text-xs text-white/50 pt-1 border-t border-white/10">{me.user.phone || "—"}</p>
            <p className="text-xs text-white/45">
              Rol: <span className="text-neon">{me.user.role}</span>
            </p>
            <p className="text-xs text-white/45">
              Profil: {me.user.profileCompleted ? "to‘liq" : "to‘liq emas"}
            </p>
          </GlassCard>
        </>
      )}
      <PrimaryButton onClick={() => router.push("/onboarding")}>
        Rol va profil sozlamalari
      </PrimaryButton>
    </div>
  );
}
