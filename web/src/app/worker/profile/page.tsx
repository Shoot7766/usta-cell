"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadWebApp } from "@/lib/twa";
import { getBestEffortLatLng } from "@/lib/geo";
import { FALLBACK_REGION_LAT, FALLBACK_REGION_LNG } from "@/lib/worker-defaults";
import { apiJson } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TwaShell } from "@/components/telegram/TwaShell";

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
  } | null;
};

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
  const [saving, setSaving] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const [ready, setReady] = useState(false);

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
      setReady(true);
    })();
  }, [router]);

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
