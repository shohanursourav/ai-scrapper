import { isFound, type Lead } from "./types";

export type PainPointKey = "website" | "gmb_missing" | "gmb_poor" | "social" | "website_down";

export interface PainPoint {
  key: PainPointKey;
  label: string;
  pitch: string;
}

/**
 * Deterministic pain-point analysis. This runs BEFORE the LLM so the model is
 * told exactly what to pitch, instead of guessing.
 * Priority: no website > broken website > GMB missing > GMB poor > no socials.
 */
export function analyzePainPoints(lead: Lead): PainPoint[] {
  const out: PainPoint[] = [];
  if (!isFound(lead.website)) {
    out.push({ key: "website", label: "No website", pitch: "website design and development" });
  } else if (lead.meta.websiteReachable === false) {
    out.push({ key: "website_down", label: "Website not loading", pitch: "fixing or rebuilding their website" });
  }
  if (lead.meta.gmbStatus === "missing" || (lead.meta.source === "google" && !isFound(lead.gmbLink))) {
    out.push({ key: "gmb_missing", label: "No Google Business Profile", pitch: "local SEO and setting up a Google Business Profile" });
  } else if (lead.meta.gmbStatus === "poor") {
    const r = lead.meta.rating, n = lead.meta.reviewCount;
    const detail = r !== null && n !== null ? ` (${r} stars from ${n} reviews)` : "";
    out.push({ key: "gmb_poor", label: `Weak Google profile${detail}`, pitch: "local SEO and Google Business Profile optimization, including getting more reviews" });
  }
  const socials = [lead.facebook, lead.instagram, lead.tiktok, lead.youtube];
  const missingSocial = socials.filter((s) => !isFound(s)).length;
  if (missingSocial === socials.length || (!isFound(lead.facebook) && !isFound(lead.instagram))) {
    out.push({ key: "social", label: missingSocial === 4 ? "No social media" : "No Facebook or Instagram", pitch: "social media marketing and growth" });
  }
  return out;
}

/** 0-100: how much this lead needs help (higher = hotter lead for an agency). */
export function opportunityScore(lead: Lead): number {
  const w: Record<PainPointKey, number> = { website: 40, website_down: 30, gmb_missing: 30, gmb_poor: 20, social: 20 };
  const s = analyzePainPoints(lead).reduce((a, p) => a + w[p.key], 0);
  const reachable = isFound(lead.email) || isFound(lead.phone) ? 10 : 0;
  return Math.min(100, s + reachable);
}
