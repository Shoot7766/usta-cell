"use client";

import { useCallback, useEffect, useState } from "react";
import { apiJson } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";

/* ─── Types ─────────────────────────────────────────────────────────────── */

type AdminStats = {
  usersTotal: number; clients: number; workers: number; admins: number;
  ordersTotal: number; ordersCompleted: number;
  topupPending: number; topupApprovedTotal: number;
};
type TopupRow = {
  id: string; worker_id: string; amount_cents: number; status: string;
  created_at: string; resolved_at: string | null;
  receipt_url?: string | null; worker_label?: string | null;
};
type DisputeRow = { id: string; reason: string; status: string };

type SourceRow = {
  id: string; type: string; identifier: string;
  label: string | null; enabled: boolean; created_at: string;
};
type LeadRow = {
  kind: "worker_offer" | "client_request"; id: string;
  summary: string | null; category: string | null;
  phone: string | null; name: string | null; handle: string | null;
  source: string | null; source_url: string | null;
  status: string; city?: string | null; created_at: string;
};
type ImportResult = {
  type: string; id: string | null; created: boolean;
  notified: boolean; phone: string | null; summary: string;
};

/* ─── Tab bar ───────────────────────────────────────────────────────────── */

type Tab = "stats" | "sources" | "import" | "leads";
const TABS: { id: Tab; label: string }[] = [
  { id: "stats",   label: "📊 Stats"   },
  { id: "sources", label: "🔗 Manbalar" },
  { id: "import",  label: "🤖 Import"  },
  { id: "leads",   label: "📋 Leadlar" },
];

/* ─── Main page ─────────────────────────────────────────────────────────── */

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("stats");

  /* stats */
  const [stats, setStats]       = useState<AdminStats | null>(null);
  const [topups, setTopups]     = useState<TopupRow[]>([]);
  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [disputeRes, setDisputeRes] = useState("");
  const [topupBusy, setTopupBusy]   = useState<string | null>(null);

  /* sources */
  const [sources, setSources]       = useState<SourceRow[]>([]);
  const [srcType, setSrcType]       = useState("telegram_channel");
  const [srcId, setSrcId]           = useState("");
  const [srcLabel, setSrcLabel]     = useState("");
  const [srcSaving, setSrcSaving]   = useState(false);
  const [srcError, setSrcError]     = useState("");

  /* manual import */
  const [importText, setImportText]         = useState("");
  const [importProvider, setImportProvider] = useState("telegram");
  const [importPhone, setImportPhone]       = useState("");
  const [importName, setImportName]         = useState("");
  const [importUrl, setImportUrl]           = useState("");
  const [importBusy, setImportBusy]         = useState(false);
  const [importResult, setImportResult]     = useState<ImportResult | null>(null);

  /* notify by phone */
  const [notifyPhone, setNotifyPhone]     = useState("");
  const [notifyMsg, setNotifyMsg]         = useState("");
  const [notifyBusy, setNotifyBusy]       = useState(false);
  const [notifyResult, setNotifyResult]   = useState<{ ok: boolean; found: boolean; notified: boolean; reason?: string | null; displayName?: string | null } | null>(null);

  /* leads */
  const [leads, setLeads]           = useState<LeadRow[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);

  /* ── Loaders ─────────────────────────────────────────────────────── */

  const loadStats = useCallback(async () => {
    const r = await apiJson<{ stats: AdminStats }>("/api/admin/stats");
    if (r.ok && r.data?.stats) setStats(r.data.stats);
  }, []);
  const loadTopups = useCallback(async () => {
    const r = await apiJson<{ requests: TopupRow[] }>("/api/admin/topup-requests");
    if (r.ok && r.data?.requests) setTopups(r.data.requests);
  }, []);
  const loadDisputes = useCallback(async () => {
    const r = await apiJson<{ disputes: DisputeRow[] }>("/api/disputes");
    if (r.ok && r.data) setDisputes(r.data.disputes);
  }, []);
  const loadSources = useCallback(async () => {
    const r = await apiJson<{ sources: SourceRow[] }>("/api/admin/sources");
    if (r.ok && r.data) setSources(r.data.sources);
  }, []);
  const loadLeads = useCallback(async () => {
    setLeadsLoading(true);
    const r = await apiJson<{ leads: LeadRow[] }>("/api/admin/import-leads");
    if (r.ok && r.data) setLeads(r.data.leads);
    setLeadsLoading(false);
  }, []);

  useEffect(() => {
    void loadStats();
    void loadTopups();
    void loadDisputes();
  }, [loadStats, loadTopups, loadDisputes]);

  useEffect(() => {
    if (tab === "sources") void loadSources();
    if (tab === "leads")   void loadLeads();
  }, [tab, loadSources, loadLeads]);

  /* ── Stats tab actions ───────────────────────────────────────────── */

  const approveTopup = async (id: string) => {
    setTopupBusy(id);
    await apiJson(`/api/admin/topup-requests/${id}/approve`, { method: "POST" });
    setTopupBusy(null);
    await loadTopups();
  };
  const resolveDispute = async (id: string) => {
    await apiJson(`/api/disputes/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ resolution: disputeRes || "Hal qilindi" }),
    });
    await loadDisputes();
  };

  /* ── Sources tab actions ─────────────────────────────────────────── */

  const addSource = async () => {
    setSrcError("");
    if (!srcId.trim()) { setSrcError("Identifier kiriting"); return; }
    setSrcSaving(true);
    const r = await apiJson<{ source?: SourceRow; error?: string }>("/api/admin/sources", {
      method: "POST",
      body: JSON.stringify({ type: srcType, identifier: srcId.trim(), label: srcLabel.trim() || null }),
    });
    setSrcSaving(false);
    if (r.ok) {
      setSrcId(""); setSrcLabel("");
      await loadSources();
    } else {
      setSrcError(r.data?.error ?? r.error ?? "Xato");
    }
  };
  const toggleSource = async (src: SourceRow) => {
    await apiJson(`/api/admin/sources/${src.id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: !src.enabled }),
    });
    await loadSources();
  };
  const deleteSource = async (id: string) => {
    await apiJson(`/api/admin/sources/${id}`, { method: "DELETE" });
    await loadSources();
  };

  /* ── Import tab actions ──────────────────────────────────────────── */

  const runImport = async () => {
    if (!importText.trim()) return;
    setImportBusy(true);
    setImportResult(null);
    const r = await apiJson<{ ok: boolean; result: ImportResult }>("/api/admin/import/run", {
      method: "POST",
      body: JSON.stringify({
        text: importText,
        provider: importProvider,
        contactPhone: importPhone || undefined,
        contactName: importName || undefined,
        sourceUrl: importUrl || undefined,
      }),
    });
    setImportBusy(false);
    if (r.ok && r.data?.result) setImportResult(r.data.result);
  };
  const runNotify = async () => {
    if (!notifyPhone.trim()) return;
    setNotifyBusy(true);
    setNotifyResult(null);
    const r = await apiJson<{ ok: boolean; found: boolean; notified: boolean; reason?: string | null; displayName?: string | null }>("/api/admin/notify-phone", {
      method: "POST",
      body: JSON.stringify({ phone: notifyPhone, message: notifyMsg || undefined }),
    });
    setNotifyBusy(false);
    if (r.data) setNotifyResult(r.data);
  };

  /* ─── UI ─────────────────────────────────────────────────────────── */

  const tabCls = (t: Tab) =>
    `flex-1 py-2 text-xs font-semibold rounded-xl transition-colors ${
      tab === t
        ? "bg-white/10 text-white border border-white/15"
        : "text-white/40 hover:text-white/70"
    }`;

  return (
    <div className="min-h-dvh px-4 pt-4 pb-10">
      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 p-1 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
        {TABS.map((t) => (
          <button key={t.id} className={tabCls(t.id)} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── STATS tab ───────────────────────────────────────────────── */}
      {tab === "stats" && (
        <div className="space-y-8">
          <section>
            <h2 className="text-base font-bold gradient-text mb-3">Statistika</h2>
            {stats ? (
              <GlassCard className="p-4 space-y-2 text-sm text-white/80">
                <p>Foydalanuvchilar: <strong className="text-white">{stats.usersTotal}</strong> (mijoz: {stats.clients}, usta: {stats.workers}, admin: {stats.admins})</p>
                <p>Buyurtmalar: <strong className="text-white">{stats.ordersTotal}</strong> · yakunlangan: {stats.ordersCompleted}</p>
                <p>To&apos;ldirish: kutilmoqda <strong className="text-amber-200">{stats.topupPending}</strong> · tasdiqlangan: {stats.topupApprovedTotal}</p>
              </GlassCard>
            ) : (
              <p className="text-xs text-white/40">Yuklanmadi — admin sifatida kiring.</p>
            )}
          </section>

          <section>
            <h2 className="text-base font-bold gradient-text mb-3">Usta to&apos;ldirish so&apos;rovlari</h2>
            <div className="space-y-3">
              {topups.length === 0 && <p className="text-sm text-white/40">So&apos;rovlar yo&apos;q.</p>}
              {topups.map((t) => (
                <GlassCard key={t.id} className="p-4 space-y-2">
                  <p className="text-xs text-white/45">{t.status}</p>
                  <p className="text-sm text-white/90">{(t.amount_cents ?? 0).toLocaleString("uz-UZ")} so&apos;m</p>
                  <p className="text-[11px] text-white/50">{t.worker_label ?? t.worker_id}</p>
                  {t.receipt_url?.startsWith("http") && (
                    <a href={t.receipt_url} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-cyan-300 underline">Chekni ochish</a>
                  )}
                  <p className="text-[10px] text-white/35">{new Date(t.created_at).toLocaleString("uz-UZ")}</p>
                  {t.status === "pending" && (
                    <PrimaryButton className="!py-2 !text-xs" disabled={topupBusy === t.id} onClick={() => void approveTopup(t.id)}>
                      {topupBusy === t.id ? "…" : "Tasdiqlash"}
                    </PrimaryButton>
                  )}
                </GlassCard>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-base font-bold gradient-text mb-3">Nizolar</h2>
            <textarea
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm mb-3"
              placeholder="Yechim matni"
              value={disputeRes}
              onChange={(e) => setDisputeRes(e.target.value)}
            />
            <div className="space-y-3">
              {disputes.length === 0 && <p className="text-sm text-white/40">Nizolar yo&apos;q.</p>}
              {disputes.map((d) => (
                <GlassCard key={d.id} className="p-4 space-y-2">
                  <p className="text-xs text-white/45">{d.status}</p>
                  <p className="text-sm">{d.reason}</p>
                  {d.status === "open" && (
                    <PrimaryButton className="!py-2 !text-xs" onClick={() => void resolveDispute(d.id)}>Yechim kiritish</PrimaryButton>
                  )}
                </GlassCard>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ── SOURCES tab ─────────────────────────────────────────────── */}
      {tab === "sources" && (
        <div className="space-y-6">
          <section>
            <h2 className="text-base font-bold gradient-text mb-3">Yangi manba qo&apos;shish</h2>
            <GlassCard className="p-4 space-y-3">
              <div className="flex gap-2">
                <select
                  className="rounded-xl bg-black/30 border border-white/10 px-2 py-2 text-sm text-white"
                  value={srcType}
                  onChange={(e) => setSrcType(e.target.value)}
                >
                  <option value="telegram_channel">Telegram kanal</option>
                  <option value="website">Veb-sayt</option>
                  <option value="custom">Boshqa</option>
                </select>
                <input
                  className="flex-1 rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
                  placeholder={srcType === "telegram_channel" ? "@kanal yoki -100123456" : "https://..."}
                  value={srcId}
                  onChange={(e) => setSrcId(e.target.value)}
                />
              </div>
              <input
                className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
                placeholder="Nom (ixtiyoriy): OLX Toshkent"
                value={srcLabel}
                onChange={(e) => setSrcLabel(e.target.value)}
              />
              {srcError && <p className="text-xs text-red-400">{srcError}</p>}
              <PrimaryButton disabled={srcSaving} onClick={() => void addSource()}>
                {srcSaving ? "…" : "Qo'shish"}
              </PrimaryButton>
              <p className="text-[11px] text-white/35">
                Telegram kanallar uchun bot kanalga admin qilib qo&apos;shilgan bo&apos;lishi kerak. Webhook orqali yangi postlar avtomatik import qilinadi.
              </p>
            </GlassCard>
          </section>

          <section>
            <h2 className="text-base font-bold gradient-text mb-3">Manbalar ro&apos;yxati</h2>
            {sources.length === 0 && <p className="text-sm text-white/40">Manbalar yo&apos;q.</p>}
            <div className="space-y-2">
              {sources.map((s) => (
                <GlassCard key={s.id} className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-white/90">{s.identifier}</p>
                    <p className="text-[11px] text-white/40">{s.label ?? s.type} · {new Date(s.created_at).toLocaleDateString("uz-UZ")}</p>
                  </div>
                  <button
                    className={`text-xs px-2 py-1 rounded-lg border transition-colors ${s.enabled ? "border-emerald-400/30 text-emerald-300 bg-emerald-500/10" : "border-white/10 text-white/30 bg-black/20"}`}
                    onClick={() => void toggleSource(s)}
                  >
                    {s.enabled ? "Yoqiq" : "O'chiq"}
                  </button>
                  <button
                    className="text-xs px-2 py-1 rounded-lg border border-red-400/20 text-red-300/70 bg-red-500/5 hover:bg-red-500/15 transition-colors"
                    onClick={() => void deleteSource(s.id)}
                  >
                    O&apos;chirish
                  </button>
                </GlassCard>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ── IMPORT tab ──────────────────────────────────────────────── */}
      {tab === "import" && (
        <div className="space-y-6">
          <section>
            <h2 className="text-base font-bold gradient-text mb-3">AI orqali qo&apos;lda import</h2>
            <GlassCard className="p-4 space-y-3">
              <textarea
                className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm min-h-[90px]"
                placeholder="E'lon yoki xabar matnini shu yerga yapishtiring…"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
              <div className="flex gap-2">
                <select
                  className="rounded-xl bg-black/30 border border-white/10 px-2 py-2 text-sm text-white"
                  value={importProvider}
                  onChange={(e) => setImportProvider(e.target.value)}
                >
                  <option value="telegram">Telegram</option>
                  <option value="olx">OLX</option>
                  <option value="instagram">Instagram</option>
                  <option value="custom">Boshqa</option>
                </select>
                <input
                  className="flex-1 rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
                  placeholder="Telefon (ixtiyoriy)"
                  value={importPhone}
                  onChange={(e) => setImportPhone(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
                  placeholder="Ism/Kompaniya (ixtiyoriy)"
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                />
                <input
                  className="flex-1 rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
                  placeholder="Manba URL (ixtiyoriy)"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                />
              </div>
              <PrimaryButton disabled={importBusy || !importText.trim()} onClick={() => void runImport()}>
                {importBusy ? "AI tahlil qilyapti…" : "Tahlil qil va import qil"}
              </PrimaryButton>
            </GlassCard>

            {importResult && (
              <GlassCard className={`mt-3 p-4 space-y-1.5 border ${importResult.type === "worker_offer" ? "border-fuchsia-400/25" : importResult.type === "client_request" ? "border-cyan-400/25" : "border-white/10"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${importResult.type === "worker_offer" ? "bg-fuchsia-500/20 text-fuchsia-200" : importResult.type === "client_request" ? "bg-cyan-500/20 text-cyan-200" : "bg-white/5 text-white/40"}`}>
                    {importResult.type === "worker_offer" ? "Usta" : importResult.type === "client_request" ? "Mijoz" : importResult.type}
                  </span>
                  {importResult.created && <span className="text-xs text-emerald-300">✓ Yaratildi</span>}
                  {importResult.notified && <span className="text-xs text-blue-300">✓ Xabardor</span>}
                </div>
                <p className="text-sm text-white/80">{importResult.summary || "—"}</p>
                {importResult.phone && <p className="text-xs text-white/50">📱 {importResult.phone}</p>}
                {importResult.type === "irrelevant" && <p className="text-xs text-white/40">Tegishli emas (irrelevant) — saqlanmadi</p>}
              </GlassCard>
            )}
          </section>

          <section>
            <h2 className="text-base font-bold gradient-text mb-3">Telefon orqali bildirishnoma</h2>
            <GlassCard className="p-4 space-y-3">
              <input
                className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm"
                placeholder="+998901234567"
                value={notifyPhone}
                onChange={(e) => setNotifyPhone(e.target.value)}
              />
              <textarea
                className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm min-h-[60px]"
                placeholder="Xabar matni (bo'sh qoldiring — standart matn)"
                value={notifyMsg}
                onChange={(e) => setNotifyMsg(e.target.value)}
              />
              <PrimaryButton disabled={notifyBusy || !notifyPhone.trim()} onClick={() => void runNotify()}>
                {notifyBusy ? "…" : "Bot orqali yuborish"}
              </PrimaryButton>
              {notifyResult && (
                <div className={`text-xs rounded-xl p-3 ${notifyResult.notified ? "bg-emerald-500/10 text-emerald-200 border border-emerald-400/20" : "bg-amber-500/10 text-amber-200 border border-amber-400/20"}`}>
                  {notifyResult.notified
                    ? `✅ Yuborildi — ${notifyResult.displayName ?? notifyPhone}`
                    : `⚠️ ${notifyResult.reason ?? (notifyResult.found ? "Topildi, lekin yuborilmadi" : "Topilmadi")}`}
                </div>
              )}
            </GlassCard>
          </section>
        </div>
      )}

      {/* ── LEADS tab ───────────────────────────────────────────────── */}
      {tab === "leads" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold gradient-text">Tashqi leadlar ({leads.length})</h2>
            <button className="text-xs text-white/40 underline" onClick={() => void loadLeads()}>
              Yangilash
            </button>
          </div>
          {leadsLoading && <p className="text-sm text-white/40 text-center py-8">Yuklanmoqda…</p>}
          {!leadsLoading && leads.length === 0 && (
            <p className="text-sm text-white/40 text-center py-8">Tashqi leadlar yo&apos;q.</p>
          )}
          {leads.map((lead) => (
            <GlassCard key={`${lead.kind}-${lead.id}`} className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${lead.kind === "worker_offer" ? "bg-fuchsia-500/20 text-fuchsia-200" : "bg-cyan-500/20 text-cyan-200"}`}>
                  {lead.kind === "worker_offer" ? "🔨 Usta" : "📋 Mijoz"}
                </span>
                <span className="text-[10px] text-white/35">
                  {new Date(lead.created_at).toLocaleDateString("uz-UZ")}
                </span>
              </div>
              {lead.summary && <p className="text-sm text-white/80 line-clamp-2">{lead.summary}</p>}
              <div className="flex flex-wrap gap-2 text-[11px] text-white/45">
                {lead.category && <span>🏷 {lead.category}</span>}
                {lead.city && <span>📍 {lead.city}</span>}
                {lead.source && <span>📡 {lead.source}</span>}
              </div>
              {(lead.name || lead.phone || lead.handle) && (
                <div className="text-xs text-white/55 space-y-0.5">
                  {lead.name && <p>👤 {lead.name}</p>}
                  {lead.phone && <p>📱 {lead.phone}</p>}
                  {lead.handle && <p>✈️ {lead.handle}</p>}
                </div>
              )}
              {lead.source_url && (
                <a href={lead.source_url} target="_blank" rel="noopener noreferrer"
                  className="inline-block text-[11px] text-cyan-300/70 underline truncate max-w-full">
                  {lead.source_url}
                </a>
              )}
              {lead.phone && (
                <button
                  className="text-xs text-blue-300 underline"
                  onClick={() => { setTab("import"); setNotifyPhone(lead.phone ?? ""); }}
                >
                  📨 Xabar yuborish
                </button>
              )}
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
