"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadWebApp } from "@/lib/twa";
import { getBestEffortLatLng } from "@/lib/geo";
import { FALLBACK_REGION_LAT, FALLBACK_REGION_LNG } from "@/lib/worker-defaults";
import { apiJson } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TwaShell } from "@/components/telegram/TwaShell";
import { FREE_ORDER_ACCEPTS, ORDER_ACCEPT_FEE_CENTS } from "@/lib/constants";
import { hapticSuccess } from "@/lib/haptic";

const MiniMapPicker = dynamic(
  () =>
    import("@/components/map/MiniMapPicker").then((m) => ({ default: m.MiniMapPicker })),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[200px] w-full rounded-xl border border-white/10 bg-white/5 animate-pulse" />
    ),
  }
);

type Me = {
  user: {
    role: string;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
  };
  workerEarningsCents?: number;
  workerLeadsBalanceCents?: number;
  workerFreeAcceptsRemaining?: number;
  workerProfile?: {
    services: string[];
    lat: number | null;
    lng: number | null;
    priceMinCents: number;
    priceMaxCents: number;
    bio?: string | null;
    cityName?: string | null;
  } | null;
};

type ReviewRow = { rating: number; comment: string | null; created_at: string };

type TgUser = {
  photo_url?: string;
  first_name?: string;
  last_name?: string;
};

export default function WorkerProfilePage() {
  const router = useRouter();
  const [tier, setTier] = useState<"free" | "pro">("free");
  const [me, setMe] = useState<Me | null>(null);
  const [tgUser, setTgUser] = useState<TgUser | null>(null);
  const [services, setServices] = useState("");
  const [bio, setBio] = useState("");
  const [cityName, setCityName] = useState("");
  const [pMin, setPMin] = useState("");
  const [pMax, setPMax] = useState("");
  const [mapLat, setMapLat] = useState(FALLBACK_REGION_LAT);
  const [mapLng, setMapLng] = useState(FALLBACK_REGION_LNG);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const [leadDepLoading, setLeadDepLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [tgReady, setTgReady] = useState(false);
  const syncedTgName = useRef(false);

  const displayNameLine = useMemo(() => {
    if (tgUser?.first_name) {
      return [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ").trim();
    }
    const u = me?.user;
    if (!u) return "—";
    const fromDb = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
    if (fromDb) return fromDb;
    return u.displayName?.trim() || "—";
  }, [tgUser, me]);

  useEffect(() => {
    void loadWebApp().then((WebApp) => {
      WebApp.BackButton.hide();
      const u = WebApp.initDataUnsafe?.user as TgUser | undefined;
      if (u && typeof u === "object") setTgUser(u);
      setTgReady(true);
    });
  }, []);

  const loadMe = async () => {
    const r = await apiJson<Me>("/api/me");
    if (r.ok && r.data) {
      setMe(r.data);
      return r.data;
    }
    return null;
  };

  useEffect(() => {
    void (async () => {
      const WebApp = await loadWebApp();
      if (WebApp.initData) {
        await apiJson("/api/auth/telegram", {
          method: "POST",
          body: JSON.stringify({ initData: WebApp.initData }),
        });
      }
      const data = await loadMe();
      if (!data || data.user.role !== "worker") {
        router.replace("/onboarding");
        return;
      }
      const wp = data.workerProfile;
      if (wp?.services?.length) setServices(wp.services.join(", "));
      if (wp?.priceMinCents) setPMin(String(wp.priceMinCents));
      if (wp?.priceMaxCents) setPMax(String(wp.priceMaxCents));
      if (wp?.lat != null && Number.isFinite(wp.lat)) setMapLat(wp.lat);
      if (wp?.lng != null && Number.isFinite(wp.lng)) setMapLng(wp.lng);
      if (wp?.bio) setBio(wp.bio);
      if (wp?.cityName) setCityName(wp.cityName);
      setReady(true);
    })();
  }, [router]);

  useEffect(() => {
    if (!ready || !tgReady || syncedTgName.current || !me) return;
    const u = tgUser;
    if (!u || !u.first_name) {
      syncedTgName.current = true;
      return;
    }
    const dn = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
    if (!dn) {
      syncedTgName.current = true;
      return;
    }
    if (dn === me.user.displayName?.trim()) {
      syncedTgName.current = true;
      return;
    }
    syncedTgName.current = true;
    void (async () => {
      await apiJson("/api/user/profile", {
        method: "PATCH",
        body: JSON.stringify({ displayName: dn }),
      });
      await loadMe();
    })();
  }, [ready, tgReady, tgUser, me]);

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
      setMapLat(g.lat);
      setMapLng(g.lng);
    } else {
      const WebApp = await loadWebApp();
      WebApp.showAlert("Joylashuv aniqlanmadi. Xaritadan nuqtani tanlang.");
    }
  };

  const saveDetails = async () => {
    setSaving(true);
    const svc = services
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    await apiJson("/api/user/profile", {
      method: "PATCH",
      body: JSON.stringify({
        bio: bio.trim() || undefined,
        cityName: cityName.trim() || undefined,
        services: svc.length ? svc : ["Umumiy ustachilik"],
        lat: mapLat,
        lng: mapLng,
        priceMinCents: parseInt(pMin, 10) || 0,
        priceMaxCents: parseInt(pMax, 10) || 0,
        isAvailable: true,
      }),
    });
    setSaving(false);
    const WebApp = await loadWebApp();
    WebApp.showAlert("Saqlandi.");
    await loadMe();
  };

  const tgAvatarUrl =
    tgUser?.photo_url && typeof tgUser.photo_url === "string"
      ? tgUser.photo_url
      : null;
  const earnings = me?.workerEarningsCents ?? 0;
  const leadsBal = me?.workerLeadsBalanceCents ?? 0;
  const freeAcceptsLeft = me?.workerFreeAcceptsRemaining ?? 0;
  const phoneLine = me?.user.phone?.trim() || null;
  const acceptFeeStr = ORDER_ACCEPT_FEE_CENTS.toLocaleString("uz-UZ");

  const depositLeads = async (amountCents: number) => {
    setLeadDepLoading(true);
    const r = await apiJson<{ leadsBalanceCents: number }>("/api/worker/leads-deposit", {
      method: "POST",
      body: JSON.stringify({ amountCents }),
    });
    setLeadDepLoading(false);
    if (r.ok && r.data) {
      hapticSuccess();
      setMe((prev) =>
        prev
          ? { ...prev, workerLeadsBalanceCents: r.data!.leadsBalanceCents }
          : prev
      );
    } else {
      const WebApp = await loadWebApp();
      WebApp.showAlert(r.error || "To‘ldirish muvaffaqiyatsiz");
    }
  };

  if (!ready || !me) {
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

      <GlassCard className="p-4 mb-3 space-y-3">
        <p className="text-[10px] uppercase tracking-wider text-white/40">Shaxsiy ma’lumot</p>
        <div className="flex items-start gap-3">
          {tgAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tgAvatarUrl}
              alt=""
              className="h-16 w-16 rounded-full object-cover border border-white/15 shrink-0"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-white/10 border border-white/15 shrink-0 flex items-center justify-center text-lg text-white/40">
              {displayNameLine.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-white truncate">{displayNameLine}</p>
            <p className="text-xs text-white/50">
              {phoneLine ? (
                <span className="text-white/80">{phoneLine}</span>
              ) : (
                <>
                  Telefon kiritilmagan —{" "}
                  <Link href="/onboarding/worker" className="text-cyan-300 underline">
                    sozlash
                  </Link>
                </>
              )}
            </p>
            <p className="text-[10px] text-white/35">
              Ism va avatar Telegramdan; telefon onboardingda saqlanadi.
            </p>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-4 mb-3 space-y-3 border border-cyan-500/20">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
          Buyurtma qabul qilish
        </p>
        <p className="text-[11px] text-white/50 leading-relaxed">
          Dastlab{" "}
          <strong className="text-white/80">{FREE_ORDER_ACCEPTS} ta buyurtma</strong> bepul qabul
          qilinadi. Keyin har bir
          yangi buyurtmani qabul qilganda hisobingizdan{" "}
          <strong className="text-cyan-200">{acceptFeeStr} so‘m</strong> yechiladi.
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-white/10 px-2.5 py-1 text-white/80">
            Bepul qabul qoldi:{" "}
            <strong className="text-cyan-200 tabular-nums">{freeAcceptsLeft}</strong>
          </span>
          <span className="rounded-lg bg-white/10 px-2.5 py-1 text-white/80">
            Qabul balansi:{" "}
            <strong className="text-white tabular-nums">
              {leadsBal.toLocaleString("uz-UZ")} so‘m
            </strong>
          </span>
        </div>
        <p className="text-[10px] text-white/35">
          Demo: qabul balansini to‘ldiring (keyin to‘lov tizimi ulanadi).
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "+50 000", cents: 50_000 },
            { label: "+100 000", cents: 100_000 },
          ].map((p) => (
            <button
              key={p.cents}
              type="button"
              disabled={leadDepLoading}
              className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs disabled:opacity-45"
              onClick={() => void depositLeads(p.cents)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-4 mb-3 space-y-2 border border-emerald-500/15">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
          Daromad
        </p>
        <p className="text-lg font-bold text-emerald-200 tabular-nums">
          {earnings.toLocaleString("uz-UZ")} so‘m
        </p>
        <p className="text-[11px] text-white/45 leading-relaxed">
          Mijoz ishni yakunlab, hamyondan to‘laganidan keyin bu yerga o‘tadi.
        </p>
      </GlassCard>

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

      <GlassCard className="p-4 mb-3 space-y-3">
        <p className="text-xs text-white/45 uppercase">Ish profili</p>
        <p className="text-[11px] text-white/40 leading-relaxed">
          Xaritada nuqtani suring yoki xaritani bosing. «Joylashuvni aniqlash» GPS / Telegram
          orqali joriy joyni qo‘yadi.
        </p>
        <MiniMapPicker
          lat={mapLat}
          lng={mapLng}
          onChange={(la, ln) => {
            setMapLat(la);
            setMapLng(ln);
          }}
          className="min-h-[200px]"
        />
        <button
          type="button"
          disabled={locLoading}
          className="w-full rounded-xl bg-white/5 border border-white/10 py-2.5 text-sm disabled:opacity-50"
          onClick={() => void pickLoc()}
        >
          {locLoading ? "Aniqlanmoqda…" : "Joylashuvni aniqlash"}
        </button>
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
        <PrimaryButton disabled={saving} onClick={() => void saveDetails()}>
          {saving ? "Saqlanmoqda…" : "Ish profilini saqlash"}
        </PrimaryButton>
        <p className="text-[10px] text-white/35">
          Portfolio: pastki menyudan «Portfolio» bo‘limiga o‘ting.
        </p>
      </GlassCard>

      <GlassCard className="p-4 mb-3 space-y-3">
        <p className="text-xs text-white/45 uppercase">Mijozlar fikri</p>
        <p className="text-[11px] text-white/40 leading-relaxed">
          Yakunlangan buyurtmadan keyin mijoz baho va izoh qoldiradi.
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
                <p className="text-xs text-amber-200/90">
                  {"★".repeat(stars)}
                  {"☆".repeat(5 - stars)}
                </p>
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
    </div>
  );
}
