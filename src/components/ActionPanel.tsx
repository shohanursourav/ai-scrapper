"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BANNED_WORDS } from "@/lib/ai/prompt";
import { findViolations } from "@/lib/ai/sanitize";
import { analyzePainPoints } from "@/lib/painPoints";
import { LEAD_COLUMNS, isFound, type Lead } from "@/lib/types";
import { emailToWhatsapp, whatsappLink } from "@/lib/whatsapp";
import { CheckIcon, MailIcon, RefreshIcon, SparkIcon, WhatsAppIcon, XIcon } from "./icons";
import type { ContactLog, Draft } from "./useCrmStore";

interface Props {
  lead: Lead;
  draft: Draft | undefined;
  generating: boolean;
  contact: ContactLog | undefined;
  gmail: { configured: boolean; connected: boolean; email: string | null };
  focus: "email" | "whatsapp" | null;
  senderName: string;
  onClose: () => void;
  onRegenerate: () => void;
  onEdit: (patch: Partial<Draft>) => void;
  onSent: (channel: "email" | "whatsapp") => void;
  toast: (msg: string, kind?: "ok" | "err") => void;
}

function linkFor(key: string, v: string) {
  if (!isFound(v)) return null;
  if (key === "email") return `mailto:${v}`;
  if (key === "instagram") return `https://www.instagram.com/${v.replace(/^@/, "")}`;
  if (key === "tiktok") return `https://www.tiktok.com/${v}`;
  if (/^https?:/.test(v)) return v;
  return null;
}

export function ActionPanel(props: Props) {
  const { lead, draft, generating, contact, gmail, focus, onClose, onRegenerate, onEdit, onSent, toast } = props;
  const [sending, setSending] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  const pains = useMemo(() => analyzePainPoints(lead), [lead]);
  const allow = /landscap|lawn|garden/i.test(lead.meta.category) ? ["landscape"] : [];
  const issues = draft ? findViolations(`${draft.subject}\n${draft.body}`, BANNED_WORDS, allow) : [];
  const words = draft ? draft.body.trim().split(/\s+/).filter(Boolean).length : 0;
  const waHref = draft ? whatsappLink(lead.phone, emailToWhatsapp(draft.body)) : null;

  useEffect(() => {
    if (!draft || generating) return;
    if (focus === "email") (draft.to ? bodyRef.current : toRef.current)?.focus();
  }, [focus, draft, generating]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function sendGmail() {
    if (!draft) return;
    if (!gmail.connected) {
      if (gmail.configured) window.location.href = "/api/auth/google";
      else toast("Gmail OAuth is not configured yet. See README > Gmail setup, or use 'Open in Gmail'.", "err");
      return;
    }
    if (!draft.to) {
      toast("Add the recipient email first", "err");
      toRef.current?.focus();
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: draft.to, subject: draft.subject, body: draft.body, fromName: props.senderName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed");
      onSent("email");
      toast(`Email sent to ${draft.to}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Send failed", "err");
    } finally {
      setSending(false);
    }
  }

  function sendWhatsapp() {
    if (!waHref) return;
    window.open(waHref, "_blank", "noopener,noreferrer");
    onSent("whatsapp");
  }

  const composeHref = draft
    ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(draft.to)}&su=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`
    : "#";

  return (
    <>
      <div className="fixed inset-0 z-30 bg-slate-900/20 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col bg-white shadow-2xl animate-[slideIn_.2s_ease-out]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-900">{lead.businessName}</h2>
            <p className="truncate text-sm text-slate-500">
              {lead.meta.category}
              {lead.meta.address ? ` · ${lead.meta.address}` : ""}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
              {lead.meta.rating !== null && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{lead.meta.rating}★ · {lead.meta.reviewCount ?? 0} reviews</span>
              )}
              {contact?.emailedAt && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-700">Emailed {new Date(contact.emailedAt).toLocaleDateString()}</span>}
              {contact?.whatsappedAt && <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700">WhatsApp {new Date(contact.whatsappedAt).toLocaleDateString()}</span>}
              {lead.meta.source === "demo" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">Demo data</span>}
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close panel">
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {/* 1. Business details */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Business details</h3>
            <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
              {LEAD_COLUMNS.filter((c) => c.key !== "businessName").map((c) => {
                const v = lead[c.key];
                const href = linkFor(c.key, v);
                return (
                  <div key={c.key} className="flex items-center justify-between gap-3 px-3 py-2">
                    <dt className="shrink-0 text-slate-500">{c.label}</dt>
                    <dd className="min-w-0 truncate text-right">
                      {isFound(v) ? (
                        href ? (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">{v.replace(/^https?:\/\/(www\.)?/, "")}</a>
                        ) : (
                          <span className="text-slate-800">{v}</span>
                        )
                      ) : (
                        <span className="font-medium text-red-600">Not Found</span>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>

          {/* Pain points */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Detected pain points</h3>
            <div className="flex flex-wrap gap-2">
              {pains.length ? (
                pains.map((p, i) => (
                  <span key={p.key} className={`rounded-full px-2.5 py-1 text-xs font-medium ${i === 0 ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-700"}`}>
                    {i === 0 ? "Main pitch: " : ""}{p.label}
                  </span>
                ))
              ) : (
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">No major gaps, pitching a free audit</span>
              )}
            </div>
          </section>

          {/* 2. Message */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Outreach message {draft && <span className="ml-1 normal-case tracking-normal text-slate-400">via {draft.provider}{draft.edited ? " · edited" : ""}</span>}
              </h3>
              <button
                onClick={onRegenerate}
                disabled={generating}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
              >
                <RefreshIcon className={`h-3.5 w-3.5 ${generating ? "animate-spin" : ""}`} /> Regenerate
              </button>
            </div>

            {generating && !draft ? (
              <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 text-sm text-slate-500">
                <SparkIcon className="h-6 w-6 animate-pulse text-indigo-500" />
                Writing a personalized message...
              </div>
            ) : draft ? (
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">To</span>
                  <input
                    ref={toRef}
                    type="email"
                    value={draft.to}
                    onChange={(e) => onEdit({ to: e.target.value })}
                    placeholder="owner@business.com (no email found, add one)"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">Subject</span>
                  <input
                    value={draft.subject}
                    onChange={(e) => onEdit({ subject: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 flex justify-between text-xs text-slate-500">
                    <span>Message (editable)</span>
                    <span className={words > 130 ? "text-amber-600" : ""}>{words} words</span>
                  </span>
                  <textarea
                    ref={bodyRef}
                    value={draft.body}
                    onChange={(e) => onEdit({ body: e.target.value })}
                    rows={13}
                    className={`w-full resize-y rounded-lg border px-3 py-2 text-sm leading-relaxed outline-none focus:ring-2 ${generating ? "opacity-50" : ""} border-slate-300 focus:border-indigo-500 focus:ring-indigo-100`}
                  />
                </label>
                {issues.length > 0 && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Style check: remove {issues.map((i) => (i === "dash" ? "em/en dashes" : `"${i}"`)).join(", ")} to keep it sounding human.
                  </p>
                )}
              </div>
            ) : null}
          </section>
        </div>

        {/* 3. CTAs */}
        <div className="space-y-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={sendGmail}
              disabled={!draft || sending || generating}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {contact?.emailedAt ? <CheckIcon className="h-4 w-4" /> : <MailIcon className="h-4 w-4" />}
              {sending ? "Sending..." : gmail.connected ? "Send via Gmail" : "Connect Gmail & Send"}
            </button>
            <button
              onClick={sendWhatsapp}
              disabled={!waHref || generating}
              title={isFound(lead.phone) ? "" : "No phone number found for this lead"}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-50"
            >
              <WhatsAppIcon className="h-4 w-4" /> Send via WhatsApp
            </button>
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>{gmail.connected ? `Sending as ${gmail.email}` : "Gmail not connected"}</span>
            {draft && (
              <a href={composeHref} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                Or open in Gmail compose
              </a>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
