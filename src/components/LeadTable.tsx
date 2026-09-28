"use client";

import { opportunityScore } from "@/lib/painPoints";
import { isFound, type Lead } from "@/lib/types";
import { whatsappNumber } from "@/lib/whatsapp";
import type { ContactLog } from "./useCrmStore";
import { CheckIcon, MailIcon, WhatsAppIcon, XIcon } from "./icons";

function hrefFor(key: string, v: string): string | null {
  if (!isFound(v)) return null;
  if (key === "email") return `mailto:${v}`;
  if (key === "instagram") return `https://www.instagram.com/${v.replace(/^@/, "")}`;
  if (key === "tiktok") return `https://www.tiktok.com/${v.startsWith("@") ? v : "@" + v}`;
  if (/^https?:\/\//.test(v)) return v;
  return null;
}

export function StatusCell({ field, value, warn, warnText }: { field: string; value: string; warn?: boolean; warnText?: string }) {
  const found = isFound(value);
  const href = hrefFor(field, value);
  const icon = found ? (
    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${warn ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600"}`}>
      <CheckIcon className="h-3.5 w-3.5" />
    </span>
  ) : (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-600">
      <XIcon className="h-3.5 w-3.5" />
    </span>
  );
  const title = found ? (warn && warnText ? `${warnText}\n${value}` : value) : "Not Found";
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" title={title} onClick={(e) => e.stopPropagation()} className="inline-flex hover:scale-110 transition">
      {icon}
    </a>
  ) : (
    <span title={title} className="inline-flex">{icon}</span>
  );
}

const COLS = [
  { key: "website", label: "Website" },
  { key: "gmbLink", label: "GMB" },
  { key: "email", label: "Email" },
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "youtube", label: "YouTube" },
] as const;

interface Props {
  leads: Lead[];
  selectedId: string | null;
  contacts: Record<string, ContactLog>;
  onSelect: (lead: Lead) => void;
  onQuickEmail: (lead: Lead) => void;
  onQuickWhatsapp: (lead: Lead) => void;
}

export function LeadTable({ leads, selectedId, contacts, onSelect, onQuickEmail, onQuickWhatsapp }: Props) {
  return (
    <div className="overflow-auto max-h-[calc(100vh-330px)] min-h-[320px] rounded-xl border border-slate-200 bg-white">
      <table className="min-w-[1100px] w-full text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr className="border-b border-slate-200">
            <th className="px-3 py-3 text-left w-10">#</th>
            <th className="px-3 py-3 text-left">Business Name</th>
            {COLS.map((c) => (
              <th key={c.key} className="px-2 py-3 text-center">{c.label}</th>
            ))}
            <th className="px-3 py-3 text-left">WhatsApp / Phone</th>
            <th className="px-3 py-3 text-center">Score</th>
            <th className="px-3 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead, i) => {
            const score = opportunityScore(lead);
            const log = contacts[lead.id];
            const wa = whatsappNumber(lead.phone);
            const gmbWarn = lead.meta.gmbStatus === "poor";
            return (
              <tr
                key={lead.id}
                onClick={() => onSelect(lead)}
                className={`cursor-pointer border-b border-slate-100 transition hover:bg-indigo-50/50 ${selectedId === lead.id ? "bg-indigo-50" : ""}`}
              >
                <td className="px-3 py-2.5 text-slate-400 tabular-nums">{i + 1}</td>
                <td className="px-3 py-2.5 max-w-[280px]">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900 truncate">{lead.businessName}</span>
                    {log?.emailedAt && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">EMAILED</span>}
                    {log?.whatsappedAt && <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">WA SENT</span>}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {lead.meta.rating !== null ? `${lead.meta.rating}★ (${lead.meta.reviewCount ?? 0}) · ` : ""}
                    {lead.meta.address || lead.meta.category}
                  </div>
                </td>
                {COLS.map((c) => (
                  <td key={c.key} className="px-2 py-2.5 text-center">
                    <StatusCell
                      field={c.key}
                      value={lead[c.key]}
                      warn={c.key === "gmbLink" && gmbWarn}
                      warnText={c.key === "gmbLink" ? "Weak profile: few reviews or low rating" : undefined}
                    />
                  </td>
                ))}
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {isFound(lead.phone) ? (
                    <span className="text-slate-700 tabular-nums">{lead.phone}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-red-600"><XIcon className="h-3.5 w-3.5" /> Not Found</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span
                    title="Opportunity score: higher means more missing assets to pitch"
                    className={`inline-block min-w-9 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                      score >= 60 ? "bg-rose-100 text-rose-700" : score >= 30 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {score}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex justify-end gap-1.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); onQuickEmail(lead); }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                      title="Open the message editor and send with Gmail"
                    >
                      <MailIcon className="h-3.5 w-3.5" /> Email
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onQuickWhatsapp(lead); }}
                      disabled={!wa}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:border-green-300 hover:bg-green-50 hover:text-green-700 disabled:cursor-not-allowed disabled:opacity-40"
                      title={wa ? "Open the message editor and send on WhatsApp" : "No phone number found"}
                    >
                      <WhatsAppIcon className="h-3.5 w-3.5" /> WhatsApp
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
