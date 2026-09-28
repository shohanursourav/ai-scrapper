"use client";

import { useState } from "react";
import type { SenderProfile } from "@/lib/types";
import { XIcon } from "./icons";

export function SettingsModal({ sender, onSave, onClose }: { sender: SenderProfile; onSave: (s: SenderProfile) => void; onClose: () => void }) {
  const [s, setS] = useState(sender);
  const field = (key: keyof SenderProfile, label: string, placeholder: string, hint?: string) => (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input
        value={s[key]}
        onChange={(e) => setS({ ...s, [key]: e.target.value })}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
      />
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your sender profile</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Close"><XIcon className="h-5 w-5" /></button>
        </div>
        <p className="mb-4 text-sm text-slate-500">Used to sign every message. Stored only in this browser.</p>
        <div className="space-y-4">
          {field("name", "Your name", "Jordan Smith")}
          {field("agency", "Agency / company", "Brightside Local Marketing")}
          {field("proof", "Proof line (optional)", "helped 9 Dallas roofers get into the Google map pack", "Real results only. The AI will never invent one.")}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
          <button onClick={() => { onSave(s); onClose(); }} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Save</button>
        </div>
      </div>
    </div>
  );
}
