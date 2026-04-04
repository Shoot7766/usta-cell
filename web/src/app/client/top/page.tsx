"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { apiJson } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
import { TwaShell } from "@/components/telegram/TwaShell";
import { Skeleton } from "@/components/ui/Skeleton";
import { haptic } from "@/lib/haptic";

type Worker = {
  user_id: string;
  display_name: string | null;
  services: string[];
  city_name: string | null;
  bio: string | null;
  rating_avg: number;
  rating_count: number;
  is_available: boolean;
  price_min_cents: number;
  price_max_cents: number;
  subscription_tier: string;
  completed_orders: number;
  score: number;
  badges: string[];
  portfolio_preview: { image_url: string; caption?: string | null }[];
};

const BADGE_LABEL: Record<string, string> = {
  top_worker: "⭐ Top",
  pro:        "💎 Pro",
  experienced:"🔨 Tajribali",
  external:   "🌐 OLX",
};

const RANK_COLORS = [
  "from-amber-400 to-yellow-300",
  "from-slate-300 to-slate-200",
  "from-amber-700 to-amber-600",
];

const POPULAR_CATS = [
  "Santexnik", "Elektrik", "Usta", "Qorovul", "Duradgor",
  "Suvoqchi", "Chilangar", "Konditsioner", "Kompyuter",
];

export default function TopWorkersPage() {
  const [all, setAll]       = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("");
  const [search, setSearch]   = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async (cat: string, q: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (cat) params.set("category", cat);
    if (q)   params.set("q", q);
    const r = await apiJson<{ workers: Worker[] }>(
      `/api/workers/top${params.toString() ? `?${params}` : ""}`
    );
    if (r.ok && r.data) setAll(r.data.workers);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(category, debouncedSearch);
  }, [category, debouncedSearch, load]);

  return (
    <div className="min-h-dvh px-4 pt-4 pb-28">
      <TwaShell />

      {/* Header */}
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">
          Eng yaxshi ustalar
        </p>
        <h1 className="text-2xl font-bold gradient-text">Top 100 Usta</h1>
        <p className="text-xs text-white/40 mt-0.5">
          Reyting, tajriba va baholarga ko&apos;ra tuzilgan
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">🔍</span>
        <input
          className="w-full rounded-xl bg-black/30 border border-white/10 pl-8 pr-3 py-2 text-sm outline-none focus:border-cyan-400/40"
          placeholder="Ism yoki kasb bo'yicha qidirish…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Category chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-none -mx-1 px-1">
        <button
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
            category === ""
              ? "bg-cyan-500/20 border-cyan-400/40 text-cyan-200"
              : "bg-white/[0.04] border-white/10 text-white/50"
          }`}
          onClick={() => { haptic.impact("light"); setCategory(""); }}
        >
          Hammasi
        </button>
        {POPULAR_CATS.map((c) => (
          <button
            key={c}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              category.toLowerCase() === c.toLowerCase()
                ? "bg-cyan-500/20 border-cyan-400/40 text-cyan-200"
                : "bg-white/[0.04] border-white/10 text-white/50"
            }`}
            onClick={() => {
              haptic.impact("light");
              setCategory((prev) =>
                prev.toLowerCase() === c.toLowerCase() ? "" : c
              );
            }}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && all.length === 0 && (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-sm text-white/50">
            {search || category
              ? "Bunday usta topilmadi. Boshqa kalit so'z kiriting."
              : "Hali ustalar yo'q."}
          </p>
        </div>
      )}

      {/* Worker list */}
      {!loading && all.length > 0 && (
        <div className="space-y-3">
          {all.map((w, idx) => {
            const rank = idx + 1;
            const isTop3 = rank <= 3;
            return (
              <Link
                key={w.user_id}
                href={`/client/worker/${w.user_id}`}
                onClick={() => haptic.impact("light")}
              >
                <GlassCard
                  className="p-4 flex gap-3 items-start hover:bg-white/[0.06] transition-colors"
                  glow={isTop3}
                >
                  {/* Rank badge */}
                  <div className="shrink-0 flex flex-col items-center">
                    {isTop3 ? (
                      <div
                        className={`w-9 h-9 rounded-full bg-gradient-to-br ${RANK_COLORS[rank - 1]} flex items-center justify-center text-sm font-black text-[#070a12] shadow-lg`}
                      >
                        {rank}
                      </div>
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-sm font-bold text-white/50">
                        {rank}
                      </div>
                    )}
                    {w.is_available && (
                      <span className="mt-1 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-white truncate">
                        {w.display_name || "Usta"}
                      </p>
                      <span className="shrink-0 text-[11px] text-amber-300 font-semibold">
                        ⭐ {w.rating_avg > 0 ? w.rating_avg.toFixed(1) : "—"}
                      </span>
                    </div>

                    {/* Services */}
                    {w.services.length > 0 && (
                      <p className="text-xs text-white/50 mt-0.5 truncate">
                        {w.services.slice(0, 3).join(" · ")}
                        {w.services.length > 3 && ` +${w.services.length - 3}`}
                      </p>
                    )}

                    {/* Meta row */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-[11px] text-white/40">
                      {w.city_name && <span>📍 {w.city_name}</span>}
                      {w.rating_count > 0 && (
                        <span>{w.rating_count} sharh</span>
                      )}
                      {w.completed_orders > 0 && (
                        <span>{w.completed_orders} buyurtma</span>
                      )}
                      {w.price_min_cents > 0 && (
                        <span>
                          {w.price_min_cents.toLocaleString()}
                          {w.price_max_cents > 0 && `–${w.price_max_cents.toLocaleString()}`} so&apos;m
                        </span>
                      )}
                    </div>

                    {/* Badges */}
                    {w.badges.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {w.badges.map((b) => (
                          <span
                            key={b}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-fuchsia-500/15 text-fuchsia-200 border border-fuchsia-400/15"
                          >
                            {BADGE_LABEL[b] ?? b}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Portfolio preview */}
                    {w.portfolio_preview.length > 0 && (
                      <div className="flex gap-1.5 mt-2">
                        {w.portfolio_preview.slice(0, 3).map((p, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={`${p.image_url}-${i}`}
                            src={p.image_url}
                            alt={p.caption || ""}
                            className="h-10 w-10 rounded-lg object-cover border border-white/10 bg-black/30"
                            referrerPolicy="no-referrer"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </GlassCard>
              </Link>
            );
          })}
        </div>
      )}

      {/* Footer count */}
      {!loading && all.length > 0 && (
        <p className="text-center text-xs text-white/25 mt-6 pb-2">
          {all.length} ta usta ko&apos;rsatilmoqda
        </p>
      )}
    </div>
  );
}
