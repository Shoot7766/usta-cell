"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadWebApp } from "@/lib/twa";
import { apiJson } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TwaShell } from "@/components/telegram/TwaShell";
import { hapticSuccess } from "@/lib/haptic";

type Me = {
  user: { role: string };
  workerProfile?: {
    portfolio?: { imageUrl: string; caption?: string }[];
  } | null;
};

export default function WorkerPortfolioPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [portfolioItems, setPortfolioItems] = useState<{ imageUrl: string; caption: string }[]>(
    []
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  /** Keyingi yuklanadigan rasm uchun izoh (yuklashdan oldin yoziladi). */
  const [nextCaption, setNextCaption] = useState("");

  useEffect(() => {
    void loadWebApp().then((WebApp) => {
      WebApp.BackButton.hide();
    });
  }, []);

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
      if (!r.ok || !r.data || r.data.user.role !== "worker") {
        router.replace("/onboarding");
        return;
      }
      const wp = r.data.workerProfile;
      if (wp?.portfolio?.length) {
        setPortfolioItems(
          wp.portfolio.map((p) => ({
            imageUrl: p.imageUrl || "",
            caption: p.caption?.trim() ?? "",
          }))
        );
      }
      setReady(true);
    })();
  }, [router]);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || portfolioItems.length >= 12) return;
    setUploading(true);
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch("/api/media/portfolio-image", {
      method: "POST",
      body: fd,
      credentials: "include",
    });
    setUploading(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      const WebApp = await loadWebApp();
      WebApp.showAlert(j.error || "Yuklash muvaffaqiyatsiz");
      return;
    }
    const j = (await res.json()) as { url?: string };
    if (j.url) {
      const cap = nextCaption.trim();
      setNextCaption("");
      setPortfolioItems((p) => [...p, { imageUrl: j.url!, caption: cap }]);
      hapticSuccess();
    }
  };

  const savePortfolio = async () => {
    setSaving(true);
    const portfolio = portfolioItems
      .map((p) => ({
        imageUrl: p.imageUrl.trim(),
        caption: p.caption.trim() || undefined,
      }))
      .filter((p) => p.imageUrl.length > 0);
    const r = await apiJson("/api/user/profile", {
      method: "PATCH",
      body: JSON.stringify({ portfolio }),
    });
    setSaving(false);
    const WebApp = await loadWebApp();
    if (r.ok) {
      hapticSuccess();
      WebApp.showAlert("Portfolio saqlandi.");
    } else {
      WebApp.showAlert(r.error || "Saqlanmadi");
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
    <div className="min-h-dvh px-4 pt-4 pb-28">
      <TwaShell />
      <h1 className="text-lg font-bold gradient-text mb-1">Portfolio</h1>
      <p className="text-xs text-white/50 mb-4 leading-relaxed">
        Ishlaringizdan rasm qo‘shing. Telegramda galereya yoki kamera orqali tanlash uchun quyidagi
        tugmani bosing. Mijozlar «Ustalar» ro‘yxatida ularni ko‘radi.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => void onPickFile(e)}
      />

      <GlassCard className="p-4 mb-3 space-y-3">
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-white/40">
            Rasm uchun izoh
          </p>
          <textarea
            className="w-full min-h-[64px] rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
            placeholder="Bu rasm nima ish? (ixtiyoriy — yuklashdan oldin yozing)"
            value={nextCaption}
            onChange={(e) => setNextCaption(e.target.value)}
          />
        </div>
        <button
          type="button"
          disabled={uploading || portfolioItems.length >= 12}
          className="w-full rounded-xl bg-gradient-to-b from-cyan-500/25 to-fuchsia-500/15 border border-white/15 py-3 text-sm font-medium disabled:opacity-45"
          onClick={() => fileRef.current?.click()}
        >
          {uploading
            ? "Yuklanmoqda…"
            : portfolioItems.length >= 12
              ? "Limit: 12 ta rasm"
              : "Telegramdan rasm tanlash (galereya / kamera)"}
        </button>

        <div className="space-y-4">
          {portfolioItems.map((row, i) => (
            <div
              key={`${row.imageUrl}-${i}`}
              className="rounded-xl border border-white/10 bg-black/25 p-3 space-y-2"
            >
              <p className="text-xs font-semibold text-cyan-200/90">Portfolio #{i + 1}</p>
              {row.imageUrl.startsWith("http") && (
                <div className="pt-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={row.imageUrl}
                    alt=""
                    className="h-36 w-full rounded-lg object-cover border border-white/10"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
              <input
                className="w-full rounded-lg bg-black/30 border border-white/10 px-2 py-1.5 text-xs"
                placeholder="Qisqa izoh (ixtiyoriy)"
                value={row.caption}
                onChange={(e) => {
                  const v = e.target.value;
                  setPortfolioItems((prev) =>
                    prev.map((p, j) => (j === i ? { ...p, caption: v } : p))
                  );
                }}
              />
              <button
                type="button"
                className="text-[11px] text-rose-300/90"
                onClick={() => setPortfolioItems((prev) => prev.filter((_, j) => j !== i))}
              >
                O‘chirish
              </button>
            </div>
          ))}
        </div>

        <PrimaryButton disabled={saving} onClick={() => void savePortfolio()}>
          {saving ? "Saqlanmoqda…" : "Portfolioni saqlash"}
        </PrimaryButton>
      </GlassCard>
    </div>
  );
}
