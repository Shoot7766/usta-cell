"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { loadWebApp } from "@/lib/twa";
import { getBestEffortLatLng } from "@/lib/geo";
import { FALLBACK_REGION_LAT, FALLBACK_REGION_LNG } from "@/lib/worker-defaults";
import { apiJson } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TwaShell } from "@/components/telegram/TwaShell";

const MiniMapPreview = dynamic(
  () =>
    import("@/components/map/MiniMapPreview").then((m) => ({ default: m.MiniMapPreview })),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[132px] w-full rounded-xl border border-white/10 bg-white/5 animate-pulse" />
    ),
  }
);

type Me = {
  user: { role: string };
  workerProfile?: {
    services: string[];
    lat: number | null;
    lng: number | null;
    priceMinCents: number;
    priceMaxCents: number;
    bio?: string | null;
    cityName?: string | null;
    portfolio?: { imageUrl: string; caption?: string }[];
  } | null;
};

type ReviewRow = { rating: number; comment: string | null; created_at: string };

export default function WorkerProfilePage() {
  const router = useRouter();
  const [tier, setTier] = useState<"free" | "pro">("free");
  const [services, setServices] = useState("");
  const [bio, setBio] = useState("");
  const [cityName, setCityName] = useState("");
  const [pMin, setPMin] = useState("");
  const [pMax, setPMax] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [portfolioItems, setPortfolioItems] = useState<{ imageUrl: string; caption: string }[]>(
    []
  );
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const mapLat = useMemo(() => {
    const n = parseFloat(lat);
    return Number.isFinite(n) ? n : FALLBACK_REGION_LAT;
  }, [lat]);

  const mapLng = useMemo(() => {
    const n = parseFloat(lng);
    return Number.isFinite(n) ? n : FALLBACK_REGION_LNG;
  }, [lng]);

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
      if (wp?.services?.length) setServices(wp.services.join(", "));
      if (wp?.priceMinCents) setPMin(String(wp.priceMinCents));
      if (wp?.priceMaxCents) setPMax(String(wp.priceMaxCents));
      if (wp?.lat != null) setLat(String(wp.lat));
      if (wp?.lng != null) setLng(String(wp.lng));
      if (wp?.bio) setBio(wp.bio);
      if (wp?.cityName) setCityName(wp.cityName);
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

  useEffect(() => {
    if (!ready) return;
    void (async () => {
      setReviewsLoading(true);
      const r = await apiJson<{ reviews: ReviewRow[] }>("/api/me/worker-reviews");
      setReviewsLoading(false);
      if (r.ok && r.data?.reviews) setReviews(r.data.reviews);
    })();
  }, [ready]);

  const sub = async (t: "free" | "pro") => {
    const r = await apiJson("/api/subscriptions", {
      method: "POST",
      body: JSON.stringify({ tier: t }),
    });
    if (r.ok) setTier(t);
  };

  const pickLoc = async () => {
    setLocLoading(true);
    const g = await getBestEffortLatLng();
    setLocLoading(false);
    if (g) {
      setLat(String(g.lat));
      setLng(String(g.lng));
    } else {
      const WebApp = await loadWebApp();
      WebApp.showAlert("Joylashuv olinmadi.");
    }
  };

  const saveDetails = async () => {
    setSaving(true);
    const svc = services
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const portfolio = portfolioItems
      .map((p) => ({
        imageUrl: p.imageUrl.trim(),
        caption: p.caption.trim() || undefined,
      }))
      .filter((p) => p.imageUrl.length > 0);
    await apiJson("/api/user/profile", {
      method: "PATCH",
      body: JSON.stringify({
        bio: bio.trim() || undefined,
        cityName: cityName.trim() || undefined,
        services: svc.length ? svc : ["Umumiy ustachilik"],
        lat: parseFloat(lat || String(FALLBACK_REGION_LAT)),
        lng: parseFloat(lng || String(FALLBACK_REGION_LNG)),
        priceMinCents: parseInt(pMin, 10) || 0,
        priceMaxCents: parseInt(pMax, 10) || 0,
        isAvailable: true,
        portfolio: portfolio.length ? portfolio : [],
      }),
    });
    setSaving(false);
    const WebApp = await loadWebApp();
    WebApp.showAlert("Saqlandi.");
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
      <h1 className="text-lg font-bold gradient-text mb-3">Usta profili</h1>
      <GlassCard className="p-4 mb-3 space-y-2">
        <p className="text-xs text-white/45">Obuna (reyting ustuvorligi)</p>
        <p className="text-sm">Joriy: {tier}</p>
        <div className="grid grid-cols-2 gap-2">
          <PrimaryButton className="!py-2 !text-xs" onClick={() => sub("free")}>
            Free
          </PrimaryButton>
          <PrimaryButton className="!py-2 !text-xs" onClick={() => sub("pro")}>
            Pro
          </PrimaryButton>
        </div>
      </GlassCard>

      <GlassCard className="p-4 mb-3 space-y-2">
        <p className="text-xs text-white/45 uppercase">Ish zonangiz (xarita)</p>
        <p className="text-[11px] text-white/40 leading-relaxed">
          Mijozlar ro‘yxatida masofa hisobi uchun saqlangan nuqta. GPS yoki quyidagi lat/lng
          orqali yangilang.
        </p>
        <MiniMapPreview lat={mapLat} lng={mapLng} zoom={13} />
      </GlassCard>

      <GlassCard className="p-4 mb-3 space-y-3">
        <p className="text-xs text-white/45 uppercase">Portfolio</p>
        <p className="text-[11px] text-white/40 leading-relaxed">
          Ishingizdan foto havolalari (HTTPS). Mijozlar ustalarni tanlashda qisqa ko‘rinishda
          ko‘radi.
        </p>
        <div className="space-y-3">
          {portfolioItems.map((row, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/10 bg-black/25 p-3 space-y-2"
            >
              <input
                className="w-full rounded-lg bg-black/30 border border-white/10 px-2 py-1.5 text-xs"
                placeholder="https://… rasm havolasi"
                value={row.imageUrl}
                onChange={(e) => {
                  const v = e.target.value;
                  setPortfolioItems((prev) =>
                    prev.map((p, j) => (j === i ? { ...p, imageUrl: v } : p))
                  );
                }}
              />
              <input
                className="w-full rounded-lg bg-black/30 border border-white/10 px-2 py-1.5 text-xs"
                placeholder="Izoh (ixtiyoriy)"
                value={row.caption}
                onChange={(e) => {
                  const v = e.target.value;
                  setPortfolioItems((prev) =>
                    prev.map((p, j) => (j === i ? { ...p, caption: v } : p))
                  );
                }}
              />
              {row.imageUrl.trim().startsWith("http") && (
                <div className="pt-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={row.imageUrl.trim()}
                    alt=""
                    className="h-20 w-full rounded-lg object-cover border border-white/10"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
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
        <button
          type="button"
          className="w-full rounded-xl bg-white/5 border border-white/10 py-2 text-xs text-white/80 disabled:opacity-50"
          disabled={portfolioItems.length >= 12}
          onClick={() => setPortfolioItems((p) => [...p, { imageUrl: "", caption: "" }])}
        >
          + Rasm qo‘shish (maks. 12)
        </button>
      </GlassCard>

      <GlassCard className="p-4 mb-3 space-y-3">
        <p className="text-xs text-white/45 uppercase">Mijozlar fikri</p>
        <p className="text-[11px] text-white/40 leading-relaxed">
          Yakunlangan buyurtmadan keyin mijoz baho va izoh qoldiradi. Bu yerda faqat sizga
          tegishli sharhlar ko‘rinadi.
        </p>
        {reviewsLoading && <p className="text-xs text-white/45">Yuklanmoqda…</p>}
        {!reviewsLoading && reviews.length === 0 && (
          <p className="text-xs text-white/40">Hozircha sharh yo‘q.</p>
        )}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {reviews.map((rev, idx) => {
            const stars = Math.min(5, Math.max(1, Math.round(Number(rev.rating)) || 1));
            return (
            <div
              key={`${rev.created_at}-${idx}`}
              className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"
            >
              <p className="text-xs text-amber-200/90">{"★".repeat(stars)}{"☆".repeat(5 - stars)}</p>
              {rev.comment?.trim() && (
                <p className="text-xs text-white/75 mt-1 whitespace-pre-wrap">{rev.comment}</p>
              )}
              <p className="text-[10px] text-white/35 mt-1">
                {new Date(rev.created_at).toLocaleString("uz-UZ")}
              </p>
            </div>
            );
          })}
        </div>
      </GlassCard>

      <GlassCard className="p-4 mb-3 space-y-3">
        <p className="text-xs text-white/45 uppercase">Ish profili</p>
        <input
          className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
          placeholder="Xizmatlar (vergul bilan)"
          value={services}
          onChange={(e) => setServices(e.target.value)}
        />
        <textarea
          className="w-full min-h-[72px] rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
          placeholder="O‘zingiz haqingizda qisqa (ixtiyoriy)"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
        <input
          className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
          placeholder="Shahar (ixtiyoriy)"
          value={cityName}
          onChange={(e) => setCityName(e.target.value)}
        />
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
        <button
          type="button"
          disabled={locLoading}
          className="w-full rounded-xl bg-white/5 border border-white/10 py-2 text-sm disabled:opacity-50"
          onClick={() => void pickLoc()}
        >
          {locLoading ? "Joylashuv…" : "Joylashuvni GPS / Telegramdan olish"}
        </button>
        <PrimaryButton disabled={saving} onClick={() => void saveDetails()}>
          {saving ? "Saqlanmoqda…" : "Ish profilini saqlash"}
        </PrimaryButton>
      </GlassCard>

      <PrimaryButton variant="ghost" onClick={() => router.push("/onboarding/worker")}>
        Ism va telefon (onboarding)
      </PrimaryButton>
    </div>
  );
}
