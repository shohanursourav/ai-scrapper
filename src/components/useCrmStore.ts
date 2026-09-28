"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GeneratedMessage, Lead, LeadSource, SenderProfile } from "@/lib/types";

export interface Draft extends GeneratedMessage {
  to: string;
  edited?: boolean;
}

export interface ContactLog {
  emailedAt?: string;
  whatsappedAt?: string;
}

interface Persisted {
  leads: Lead[];
  city: string;
  niche: string;
  source: LeadSource | null;
  drafts: Record<string, Draft>;
  contacts: Record<string, ContactLog>;
  sender: SenderProfile;
}

const KEY = "local-lead-crm:v1";
const EMPTY: Persisted = { leads: [], city: "", niche: "", source: null, drafts: {}, contacts: {}, sender: { name: "", agency: "", proof: "" } };

/** All CRM state lives in the browser (localStorage). No database needed. */
export function useCrmStore() {
  const [state, setState] = useState<Persisted>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setState({ ...EMPTY, ...JSON.parse(raw) });
    } catch {
      /* corrupted storage, start fresh */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch {
        /* quota exceeded, ignore */
      }
    }, 300);
  }, [state, hydrated]);

  const update = useCallback((fn: (s: Persisted) => Persisted) => setState(fn), []);

  return {
    ...state,
    hydrated,
    startSearch: (city: string, niche: string) => update((s) => ({ ...s, city, niche, leads: [], drafts: {}, contacts: {}, source: null })),
    addLead: (lead: Lead) =>
      update((s) => {
        const idx = s.leads.findIndex((l) => l.id === lead.id);
        if (idx === -1) return { ...s, leads: [...s.leads, lead] };
        const leads = s.leads.slice();
        leads[idx] = lead;
        return { ...s, leads };
      }),
    setSource: (source: LeadSource) => update((s) => ({ ...s, source })),
    setDraft: (id: string, draft: Draft) => update((s) => ({ ...s, drafts: { ...s.drafts, [id]: draft } })),
    patchDraft: (id: string, patch: Partial<Draft>) =>
      update((s) => (s.drafts[id] ? { ...s, drafts: { ...s.drafts, [id]: { ...s.drafts[id], ...patch, edited: true } } } : s)),
    logContact: (id: string, channel: "email" | "whatsapp") =>
      update((s) => ({
        ...s,
        contacts: {
          ...s.contacts,
          [id]: { ...s.contacts[id], [channel === "email" ? "emailedAt" : "whatsappedAt"]: new Date().toISOString() },
        },
      })),
    setSender: (sender: SenderProfile) => update((s) => ({ ...s, sender })),
    clearAll: () => update((s) => ({ ...EMPTY, sender: s.sender })),
  };
}

export type CrmStore = ReturnType<typeof useCrmStore>;
