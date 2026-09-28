"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NICHE_SUGGESTIONS } from "@/lib/niches";
import { analyzePainPoints, opportunityScore } from "@/lib/painPoints";
import { LEAD_COLUMNS, isFound, type GeneratedMessage, type Lead, type LeadStreamEvent } from "@/lib/types";
import { emailToWhatsapp, whatsappLink } from "@/lib/whatsapp";
import { ActionPanel } from "./ActionPanel";
import { LeadTable } from "./LeadTable";
import { SettingsModal } from "./SettingsModal";
import { DownloadIcon, MailIcon, SearchIcon, SettingsIcon, SparkIcon } from "./icons";
import { useCrmStore, type Draft } from "./useCrmStore";

type Filter = "all" | "no_website" | "gmb" | "no_social" | "has_email" | "has_phone" | "not_contacted";
const FILTERS: { id: Filter; label: string; test: (l: Lead, contacted: boolean) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "no_website", label: "No website", test: (l) => analyzePainPoints(l).some((p) => p.key === "website" || p.key === "website_down") },
  { id: "gmb", label: "Weak / no GMB", test: (l) => analyzePainPoints(l).some((p) => p.key.startsWith("gmb")) },
  { id: "no_social", label: "Weak social", test: (l) => analyzePainPoints(l).some((p) => p.key === "social") },
  { id: "has_email", label: "Has email", test: (l) => isFound(l.email) },
  { id: "has_phone", label: "Has phone", test: (l) => isFound(l.phone) },
  { id: "not_contacted", label: "Not contacted", test: (_l, c) => !c },
];

interface Config { leadSource: "google" | "osm"; aiProvider: GeneratedMessage["provider"]; gmailOAuth: boolean }
interface GmailStatus { configured: boolean; connected: boolean; email: string | null }

export function Dashboard() {
  const store = useCrmStore();
  const [city, setCity] = useState("");
  const [niche, setNiche] = useState("");
  const [limit, setLimit] = useState(100);
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ message: string; progress: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sortByScore, setSortByScore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<"email" | "whatsapp" | null>(null);
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [gmail, setGmail] = useState<GmailStatus>({ configured: false, connected: false, email: null });
  const [showSettings, setShowSettings] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const draftsRef = useRef(store.drafts);
  draftsRef.current = store.drafts;
  const bulkStop = useRef(false);

  const toast = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    setToastMsg({ msg, kind });
    setTimeout(() => setToastMsg((t) => (t?.msg === msg ? null : t)), 4500);
  }, []);

  // Initial load: config, Gmail status, OAuth redirect result
  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then(setConfig).catch(() => {});
    fetch("/api/auth/status").then((r) => r.json()).then(setGmail).catch(() => {});
    const p = new URLSearchParams(window.location.search);
    const g = p.get("gmail");
    if (g) {
      if (g === "connected") toast("Gmail connected. You can now send emails.");
      else toast(`Gmail connection failed: ${p.get("reason") || "unknown error"}`, "err");
      window.history.replaceState({}, "", "/");
    }
  }, [toast]);

  // Restore last search inputs after hydration
  useEffect(() => {
    if (store.hydrated) {
      setCity((c) => c || store.city);
      setNiche((n) => n || store.niche);
    }
  }, [store.hydrated, store.city, store.niche]);

  async function generateLeads(e?: React.FormEvent, forceDemo?: boolean) {
    e?.preventDefault();
    const useDemo = forceDemo ?? demo;
    if (!city.trim() || !niche.trim()) return setError("Enter both a city and a niche.");
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null);
    setLoading(true);
    setSelectedId(null);
    setStatus({ message: "Starting search...", progress: 2 });
    store.startSearch(city.trim(), niche.trim());
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: city.trim(), niche: niche.trim(), limit, demo: useDemo }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as LeadStreamEvent;
          if (ev.type === "lead") store.addLead(ev.lead);
          else if (ev.type === "status") setStatus((s) => ({ message: ev.message, progress: ev.progress ?? s?.progress ?? 0 }));
          else if (ev.type === "error") setError(ev.message);
          else if (ev.type === "done") {
            store.setSource(ev.source);
            setStatus({ message: `Done. ${ev.total} leads ready.`, progress: 100 });
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(null), 2500);
    }
  }

  const ensureDraft = useCallback(
    async (lead: Lead, force = false): Promise<Draft | null> => {
      const existing = draftsRef.current[lead.id];
      if (existing && !force) return existing;
      setGenerating((g) => new Set(g).add(lead.id));
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lead, sender: store.sender, niche: store.niche, city: store.city }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not generate message");
        const draft: Draft = { ...(data as GeneratedMessage), to: existing?.to || (isFound(lead.email) ? lead.email : "") };
        store.setDraft(lead.id, draft);
        draftsRef.current = { ...draftsRef.current, [lead.id]: draft };
        return draft;
      } catch (err) {
        toast(err instanceof Error ? err.message : "Generation failed", "err");
        return null;
      } finally {
        setGenerating((g) => {
          const n = new Set(g);
          n.delete(lead.id);
          return n;
        });
      }
    },
    [store, toast],
  );

  function openLead(lead: Lead, f: "email" | "whatsapp" | null = null) {
    setSelectedId(lead.id);
    setFocus(f);
    void ensureDraft(lead);
  }

  async function quickWhatsapp(lead: Lead) {
    const cached = draftsRef.current[lead.id];
    if (cached) {
      const link = whatsappLink(lead.phone, emailToWhatsapp(cached.body));
      if (link) {
        window.open(link, "_blank", "noopener,noreferrer");
        store.logContact(lead.id, "whatsapp");
      }
      return;
    }
    // Open the tab synchronously (avoids popup blockers), then point it at wa.me once the message is ready.
    const win = window.open("about:blank", "_blank");
    const d = await ensureDraft(lead);
    const link = d && whatsappLink(lead.phone, emailToWhatsapp(d.body));
    if (win && link) {
      win.location.href = link;
      store.logContact(lead.id, "whatsapp");
    } else win?.close();
  }

  async function writeAll() {
    const todo = visible.filter((l) => !draftsRef.current[l.id]);
    if (!todo.length) return toast("Every visible lead already has a message.");
    bulkStop.current = false;
    setBulk({ done: 0, total: todo.length });
    for (let i = 0; i < todo.length && !bulkStop.current; i++) {
      await ensureDraft(todo[i]);
      setBulk({ done: i + 1, total: todo.length });
      // Stay under free-tier rate limits (~30 req/min on Groq, ~10 on Gemini)
      if (config?.aiProvider !== "template") await new Promise((r) => setTimeout(r, config?.aiProvider === "gemini" ? 6500 : 2100));
    }
    setBulk(null);
  }

  function exportCsv() {
    const cols = [...LEAD_COLUMNS.map((c) => c.label), "Address", "Rating", "Reviews", "GMB Status", "Opportunity Score", "Pain Points", "Subject", "Message", "Emailed", "WhatsApp Sent"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = store.leads.map((l) => {
      const d = store.drafts[l.id];
      const c = store.contacts[l.id];
      return [
        ...LEAD_COLUMNS.map((col) => l[col.key]),
        l.meta.address || "Not Found",
        l.meta.rating ?? "Not Found",
        l.meta.reviewCount ?? "Not Found",
        l.meta.gmbStatus,
        opportunityScore(l),
        analyzePainPoints(l).map((p) => p.label).join("; "),
        d?.subject ?? "",
        d?.body ?? "",
        c?.emailedAt ?? "",
        c?.whatsappedAt ?? "",
      ].map(esc).join(",");
    });
    const blob = new Blob([[cols.map(esc).join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `leads-${store.niche}-${store.city}.csv`.replace(/[^a-z0-9.-]+/gi, "-").toLowerCase();
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function disconnectGmail() {
    await fetch("/api/auth/logout", { method: "POST" });
    setGmail((g) => ({ ...g, connected: false, email: null }));
    toast("Gmail disconnected");
  }

  const visible = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter)!;
    const q = query.trim().toLowerCase();
    let list = store.leads.filter((l) => {
      const c = store.contacts[l.id];
      return f.test(l, !!(c?.emailedAt || c?.whatsappedAt)) && (!q || l.businessName.toLowerCase().includes(q) || l.meta.address.toLowerCase().includes(q));
    });
    if (sortByScore) list = [...list].sort((a, b) => opportunityScore(b) - opportunityScore(a));
    return list;
  }, [store.leads, store.contacts, filter, query, sortByScore]);

  const stats = useMemo(() => {
    const L = store.leads;
    const count = (fn: (l: Lead) => boolean) => L.filter(fn).length;
    return [
      { label: "Leads", value: L.length },
      { label: "No website", value: count((l) => !isFound(l.website)) },
      { label: "Weak / no GMB", value: count((l) => l.meta.gmbStatus === "poor" || l.meta.gmbStatus === "missing") },
      { label: "No FB & IG", value: count((l) => !isFound(l.facebook) && !isFound(l.instagram)) },
      { label: "Emails found", value: count((l) => isFound(l.email)) },
      { label: "Contacted", value: Object.values(store.contacts).filter((c) => c.emailedAt || c.whatsappedAt).length },
    ];
  }, [store.leads, store.contacts]);

  const selected = store.leads.find((l) => l.id === selectedId) || null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white"><SparkIcon className="h-4 w-4" /></div>
            <div>
              <h1 className="text-base font-semibold leading-tight">Local Lead CRM</h1>
              <p className="hidden text-xs text-slate-500 sm:block">Find home service leads, write human outreach, send.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {config && (
              <div className="hidden items-center gap-1.5 md:flex">
                <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">Data: {config.leadSource === "google" ? "Google Places" : "OpenStreetMap"}</span>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">AI: {config.aiProvider === "template" ? "Built-in template" : config.aiProvider === "groq" ? "Groq" : "Gemini"}</span>
              </div>
            )}
            {gmail.connected ? (
              <button onClick={disconnectGmail} title="Click to disconnect" className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 font-medium text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {gmail.email || "Gmail connected"}
              </button>
            ) : (
              <a
                href={gmail.configured ? "/api/auth/google" : undefined}
                onClick={(e) => { if (!gmail.configured) { e.preventDefault(); toast("Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and SESSION_SECRET to .env.local first (see README).", "err"); } }}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
              >
                <MailIcon className="h-3.5 w-3.5" /> Connect Gmail
              </a>
            )}
            <button onClick={() => setShowSettings(true)} className="rounded-full p-2 text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100" aria-label="Sender settings" title="Sender profile">
              <SettingsIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] space-y-4 px-4 py-5 sm:px-6">
        {/* Input area */}
        <form onSubmit={generateLeads} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <label className="flex-1">
              <span className="mb-1 block text-xs font-medium text-slate-600">City</span>
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Austin, TX" className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="flex-1">
              <span className="mb-1 block text-xs font-medium text-slate-600">Niche</span>
              <input list="niches" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="e.g. Roofing" className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
              <datalist id="niches">{NICHE_SUGGESTIONS.map((n) => <option key={n} value={n} />)}</datalist>
            </label>
            <label className="lg:w-28">
              <span className="mb-1 block text-xs font-medium text-slate-600">Leads</span>
              <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500">
                {[25, 50, 100, 150].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            {loading ? (
              <button type="button" onClick={() => abortRef.current?.abort()} className="rounded-xl bg-slate-800 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-900">Stop</button>
            ) : (
              <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700">
                <SearchIcon className="h-4 w-4" /> Generate Leads
              </button>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} className="rounded accent-indigo-600" />
              Demo mode (fake sample businesses, no API calls)
            </label>
            {config?.leadSource === "osm" && !demo && (
              <span>Tip: add a free Google Places key for full 100-lead results with GMB data.</span>
            )}
          </div>
          {status && (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${Math.max(3, status.progress)}%` }} />
              </div>
              <p className="mt-1.5 truncate text-xs text-slate-500">{status.message}</p>
            </div>
          )}
          {error && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <span>{error}</span>
              {!demo && /network|reach|fetch/i.test(error) && (
                <button
                  type="button"
                  onClick={() => { setDemo(true); void generateLeads(undefined, true); }}
                  className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-100"
                >
                  Use Demo mode instead
                </button>
              )}
            </div>
          )}
        </form>

        {store.leads.length > 0 ? (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {stats.map((s) => (
                <div key={s.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                  <div className="text-xl font-semibold tabular-nums">{s.value}</div>
                  <div className="text-xs text-slate-500">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Toolbar */}
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-1.5">
                {FILTERS.map((f) => (
                  <button key={f.id} onClick={() => setFilter(f.id)} className={`rounded-full px-3 py-1 text-xs font-medium transition ${filter === f.id ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"}`}>
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search leads..." className="w-44 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs outline-none focus:border-indigo-500" />
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" checked={sortByScore} onChange={(e) => setSortByScore(e.target.checked)} className="accent-indigo-600" /> Hottest first
                </label>
                {bulk ? (
                  <button onClick={() => (bulkStop.current = true)} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white">Writing {bulk.done}/{bulk.total} · Stop</button>
                ) : (
                  <button onClick={writeAll} disabled={loading} className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50 disabled:opacity-50">
                    <SparkIcon className="h-3.5 w-3.5" /> Write all messages
                  </button>
                )}
                <button onClick={exportCsv} className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100">
                  <DownloadIcon className="h-3.5 w-3.5" /> CSV
                </button>
              </div>
            </div>

            {store.source === "demo" && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Showing demo data. These businesses are fake (reserved .example domains and 555 numbers). Turn off demo mode for real leads.</p>
            )}

            <LeadTable
              leads={visible}
              selectedId={selectedId}
              contacts={store.contacts}
              onSelect={(l) => openLead(l)}
              onQuickEmail={(l) => openLead(l, "email")}
              onQuickWhatsapp={quickWhatsapp}
            />
            <p className="text-xs text-slate-400">
              Showing {visible.length} of {store.leads.length}. Click any row to open the outreach panel. Green check = found, red X = Not Found, amber = weak Google profile.
            </p>
          </>
        ) : (
          !loading && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
              <SearchIcon className="mx-auto h-8 w-8 text-slate-300" />
              <h2 className="mt-3 font-semibold">Search a city and niche to start</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                We pull local businesses, crawl their sites for emails and social profiles, spot what they are missing, and write a short human pitch for each one.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs">
                {[["Austin, TX", "Roofing"], ["Phoenix, AZ", "Plumbing"], ["Tampa, FL", "House Cleaning"], ["Denver, CO", "Electrician"]].map(([c, n]) => (
                  <button key={c} onClick={() => { setCity(c); setNiche(n); }} className="rounded-full bg-slate-100 px-3 py-1 text-slate-600 hover:bg-slate-200">{n} in {c}</button>
                ))}
              </div>
            </div>
          )
        )}
      </main>

      {selected && (
        <ActionPanel
          key={selected.id}
          lead={selected}
          draft={store.drafts[selected.id]}
          generating={generating.has(selected.id)}
          contact={store.contacts[selected.id]}
          gmail={gmail}
          focus={focus}
          senderName={store.sender.name}
          onClose={() => setSelectedId(null)}
          onRegenerate={() => void ensureDraft(selected, true)}
          onEdit={(patch) => store.patchDraft(selected.id, patch)}
          onSent={(ch) => store.logContact(selected.id, ch)}
          toast={toast}
        />
      )}

      {showSettings && <SettingsModal sender={store.sender} onSave={store.setSender} onClose={() => setShowSettings(false)} />}

      {toastMsg && (
        <div className={`fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${toastMsg.kind === "ok" ? "bg-slate-900 text-white" : "bg-red-600 text-white"}`}>
          {toastMsg.msg}
        </div>
      )}
    </div>
  );
}
