"use client";

import dynamic from "next/dynamic";
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
import { WORKER_TRADE_OPTIONS } from "@/lib/worker-trades";
import { reverseGeocodeCity } from "@/lib/reverse-geocode";
import { getWorkerTopupCardDisplay } from "@/lib/worker-topup-public";
import { ProfileExitDoor } from "@/components/ui/ProfileExitDoor";

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

const tradeSet = new Set<string>(WORKER_TRADE_OPTIONS);

export default function WorkerProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [tgUser, setTgUser] = useState<TgUser | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [selectedTrades, setSelectedTrades] = useState<string[]>([]);
  const [tradeQuery, setTradeQuery] = useState("");
  const [bio, setBio] = useState("");
  const [cityName, setCityName] = useState("");
  const [mapLat, setMapLat] = useState(FALLBACK_REGION_LAT);
  const [mapLng, setMapLng] = useState(FALLBACK_REGION_LNG);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const [topupLoading, setTopupLoading] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptLabel, setReceiptLabel] = useState<string | null>(null);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [ready, setReady] = useState(false);
  const geoDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  const cardDisplay = useMemo(() => getWorkerTopupCardDisplay(), []);

  const displayNameLine = useMemo(() => {
    const manual = editDisplayName.trim();
    if (manual) return manual;
    if (tgUser?.first_name) {
      return [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ").trim();
    }
    const u = me?.user;
    if (!u) return "—";
    const fromDb = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
    if (fromDb) return fromDb;
    return u.displayName?.trim() || "—";
  }, [editDisplayName, tgUser, me]);

  const filteredTradeOptions = useMemo(() => {
    const q = tradeQuery.trim().toLowerCase();
    if (!q) return [...WORKER_TRADE_OPTIONS];
    return WORKER_TRADE_OPTIONS.filter((t) => t.toLowerCase().includes(q));
  }, [tradeQuery]);

  const legacyExtras = useMemo(
    () => selectedTrades.filter((s) => !tradeSet.has(s)),
    [selectedTrades]
  );

  useEffect(() => {
    void loadWebApp().then((WebApp) => {
      WebApp.BackButton.hide();
      const u = WebApp.initDataUnsafe?.user as TgUser | undefined;
      if (u && typeof u === "object")       setTgUser(u);
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
      setEditDisplayName(data.user.displayName?.trim() ?? "");
      setEditPhone(data.user.phone?.trim() ?? "");
      setSelectedTrades(wp?.services?.length ? [...wp.services] : []);
      if (wp?.lat != null && Number.isFinite(wp.lat)) setMapLat(wp.lat);
      if (wp?.lng != null && Number.isFinite(wp.lng)) setMapLng(wp.lng);
      if (wp?.bio) setBio(wp.bio);
      if (wp?.cityName) setCityName(wp.cityName);
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

  const scheduleCityFromMap = (la: number, ln: number) => {
    if (geoDebounce.current) clearTimeout(geoDebounce.current);
    geoDebounce.current = setTimeout(() => {
      void (async () => {
        const city = await reverseGeocodeCity(la, ln);
        if (city) setCityName(city);
      })();
    }, 850);
  };

  const pickLoc = async () => {
    setLocLoading(true);
    const g = await getBestEffortLatLng();
    setLocLoading(false);
    if (g) {
      setMapLat(g.lat);
      setMapLng(g.lng);
      const city = await reverseGeocodeCity(g.lat, g.lng);
      if (city) setCityName(city);
    } else {
      const WebApp = await loadWebApp();
      WebApp.showAlert("Joylashuv aniqlanmadi. Xaritadan nuqtani tanlang.");
    }
  };

  const toggleTrade = (label: string) => {
    setSelectedTrades((prev) =>
      prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]
    );
  };

  const removeLegacyExtra = (label: string) => {
    setSelectedTrades((prev) => prev.filter((x) => x !== label));
  };

  const saveProfileBasics = async () => {
    const WebApp = await loadWebApp();
    const name = editDisplayName.trim();
    if (name.length < 2) {
      WebApp.showAlert("Ism kamida 2 belgi bo‘lsin.");
      return;
    }
    setProfileSaving(true);
    await apiJson("/api/user/profile", {
      method: "PATCH",
      body: JSON.stringify({
        displayName: name,
        phone: editPhone.trim() || undefined,
      }),
    });
    setProfileSaving(false);
    WebApp.showAlert("Profil saqlandi.");
    await loadMe();
  };

  const saveDetails = async () => {
    const WebApp = await loadWebApp();
    if (selectedTrades.length === 0) {
      WebApp.showAlert("Kamida bitta ustachilik turini tanlang.");
      return;
    }
    setSaving(true);
    await apiJson("/api/user/profile", {
      method: "PATCH",
      body: JSON.stringify({
        bio: bio.trim() || undefined,
        cityName: cityName.trim() || undefined,
        services: selectedTrades,
        lat: mapLat,
        lng: mapLng,
        isAvailable: true,
      }),
    });
    setSaving(false);
    WebApp.showAlert("Saqlandi.");
    await loadMe();
  };

  const onReceiptPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setReceiptUploading(true);
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch("/api/media/topup-receipt", {
      method: "POST",
      body: fd,
      credentials: "include",
    });
    setReceiptUploading(false);
    const WebApp = await loadWebApp();
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      WebApp.showAlert(j.error || "Chek yuklanmadi");
      return;
    }
    const j = (await res.json()) as { url?: string };
    if (j.url) {
      setReceiptUrl(j.url);
      setReceiptLabel(file.name);
      hapticSuccess();
    }
  };

  const requestTopup = async (amountCents: number) => {
    const WebApp = await loadWebApp();
    if (!receiptUrl) {
      WebApp.showAlert("Avval chek rasmini yuklang.");
      return;
    }
    setTopupLoading(true);
    const r = await apiJson("/api/worker/topup-request", {
      method: "POST",
      body: JSON.stringify({ amountCents, receiptUrl }),
    });
    setTopupLoading(false);
    if (r.ok) {
      hapticSuccess();
      setReceiptUrl(null);
      setReceiptLabel(null);
      WebApp.showAlert(
        "So‘rov yuborildi. Admin chek va summani tasdiqlagach qabul balansiga tushadi."
      );
    } else {
      WebApp.showAlert(r.error || "So‘rov yuborilmadi");
    }
  };

  const tgAvatarUrl =
    tgUser?.photo_url && typeof tgUser.photo_url === "string"
      ? tgUser.photo_url
      : null;
  const earnings = me?.workerEarningsCents ?? 0;
  const leadsBal = me?.workerLeadsBalanceCents ?? 0;
  const freeAcceptsLeft = me?.workerFreeAcceptsRemaining ?? 0;
  const acceptFeeStr = ORDER_ACCEPT_FEE_CENTS.toLocaleString("uz-UZ");

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
      <div className="flex items-center gap-3 mb-3">
        <ProfileExitDoor className="shrink-0" />
        <h1 className="text-lg font-bold gradient-text flex-1 min-w-0">Usta profili</h1>
      </div>

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
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-[10px] text-white/35">Ko‘rinish (Telegram rasmi alohida)</p>
            <input
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
              placeholder="Ism"
              value={editDisplayName}
              onChange={(e) => setEditDisplayName(e.target.value)}
            />
            <input
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
              placeholder="Telefon"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
            />
            <PrimaryButton
              className="!py-2 !text-xs"
              disabled={profileSaving}
              onClick={() => void saveProfileBasics()}
            >
              {profileSaving ? "Saqlanmoqda…" : "Profilni saqlash"}
            </PrimaryButton>
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
        <div className="rounded-xl border border-white/10 bg-black/25 p-3 space-y-2">
          <p className="text-[10px] uppercase text-white/40">To‘ldirish (karta)</p>
          <p className="text-xs text-white/70 font-mono tracking-wide">{cardDisplay.number}</p>
          <p className="text-[11px] text-white/55">{cardDisplay.holder}</p>
          <p className="text-[10px] text-white/40 leading-relaxed">
            1) Chekni yuklang. 2) Kartaga pul o‘tkazing. 3) Summani tanlang — so‘rov admin oldiga
            tushadi; tasdiqlangach balansga qo‘shiladi.
          </p>
        </div>
        <input
          ref={receiptInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => void onReceiptPicked(e)}
        />
        <button
          type="button"
          disabled={receiptUploading}
          className="w-full rounded-xl border border-amber-400/25 bg-amber-500/10 py-2.5 text-sm text-amber-100/95 disabled:opacity-45"
          onClick={() => receiptInputRef.current?.click()}
        >
          {receiptUploading ? "Yuklanmoqda…" : "Chek rasmini yuklash (majburiy)"}
        </button>
        {receiptUrl && (
          <p className="text-[11px] text-emerald-300/90">
            Chek qabul qilindi{receiptLabel ? `: ${receiptLabel}` : ""}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {[
            { label: "+30 000", cents: 30_000 },
            { label: "+50 000", cents: 50_000 },
            { label: "+100 000", cents: 100_000 },
          ].map((p) => (
            <button
              key={p.cents}
              type="button"
              disabled={topupLoading || !receiptUrl}
              className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs disabled:opacity-45"
              onClick={() => void requestTopup(p.cents)}
            >
              {p.label} · so‘rov
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
          Mijoz ishni yakunlab, to‘lovni tasdiqlagach bu yerga yoziladi.
        </p>
      </GlassCard>

      <GlassCard className="p-4 mb-3 space-y-3">
        <p className="text-xs text-white/45 uppercase">Ish profili</p>
        <p className="text-[11px] text-white/40 leading-relaxed">
          Xaritada nuqtani suring yoki xaritani bosing — shahar nomi avtomatik aniqlanadi (ixtiyoriy
          tahrirlash mumkin). «Joylashuvni aniqlash» GPS / Telegram orqali joriy nuqtani qo‘yadi.
        </p>
        <MiniMapPicker
          lat={mapLat}
          lng={mapLng}
          onChange={(la, ln) => {
            setMapLat(la);
            setMapLng(ln);
            scheduleCityFromMap(la, ln);
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
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] uppercase text-white/40">Ustachilik turlari</p>
            <span className="text-[10px] text-white/45 tabular-nums">
              Tanlangan: {selectedTrades.length}
            </span>
          </div>
          <input
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
            placeholder="Qidirish (masalan: santex, elektr…)"
            value={tradeQuery}
            onChange={(e) => setTradeQuery(e.target.value)}
          />
          {legacyExtras.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-amber-200/70">Eski tanlovlar (ro‘yxatdan tashqari)</p>
              <div className="flex flex-wrap gap-1.5">
                {legacyExtras.map((x) => (
                  <span
                    key={x}
                    className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-100/90"
                  >
                    {x}
                    <button
                      type="button"
                      className="text-rose-300"
                      onClick={() => removeLegacyExtra(x)}
                      aria-label="Olib tashlash"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="max-h-56 overflow-y-auto rounded-xl border border-white/10 bg-black/20 pr-1">
            {filteredTradeOptions.length === 0 && (
              <p className="p-3 text-xs text-white/40">Hech narsa topilmadi.</p>
            )}
            <ul className="divide-y divide-white/5">
              {filteredTradeOptions.map((t) => {
                const on = selectedTrades.includes(t);
                return (
                  <li key={t}>
                    <button
                      type="button"
                      onClick={() => toggleTrade(t)}
                      className={`flex w-full items-start gap-2 px-3 py-2.5 text-left text-xs transition-colors ${
                        on ? "bg-cyan-500/15 text-cyan-50" : "text-white/70 hover:bg-white/5"
                      }`}
                    >
                      <span
                        className={`mt-0.5 h-4 w-4 shrink-0 rounded border ${
                          on ? "border-cyan-400 bg-cyan-500/40" : "border-white/25"
                        }`}
                        aria-hidden
                      />
                      <span className="leading-snug">{t}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
        <textarea
          className="w-full min-h-[72px] rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
          placeholder="O‘zingiz haqingizda qisqa (ixtiyoriy)"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
        <input
          className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
          placeholder="Shahar (avtomatik yoki qo‘lda)"
          value={cityName}
          onChange={(e) => setCityName(e.target.value)}
        />
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
