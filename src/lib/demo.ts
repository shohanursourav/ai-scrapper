import { gmbStatusFrom } from "./gmb";
import { NOT_FOUND, type Lead } from "./types";

/**
 * Clearly-fake sample data so the UI can be explored without API keys or internet.
 * Uses the reserved ".example" TLD and 555-01xx fictional phone numbers.
 */
function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const PREFIX = ["Summit", "Lone Star", "Blue Ridge", "Patriot", "Eagle", "Precision", "Hometown", "Redline", "Cornerstone", "Ironclad", "Golden", "Northside", "Liberty", "Apex", "Trusty", "Reliable", "Five Star", "All Pro", "Evergreen", "Main Street"];
const SUFFIX = ["Co", "Pros", "Services", "Solutions", "& Sons", "Experts", "Group", "LLC", "Specialists", "Crew"];

export function demoLeads(city: string, niche: string, limit: number): Lead[] {
  const r = rng(`${city}|${niche}`.toLowerCase());
  const cityName = city.split(",")[0].trim();
  const nicheWord = niche.trim().replace(/\b\w/g, (c) => c.toUpperCase());
  const leads: Lead[] = [];
  const used = new Set<string>();
  for (let i = 0; leads.length < limit && i < limit * 5; i++) {
    const name = `${PREFIX[Math.floor(r() * PREFIX.length)]} ${nicheWord} ${SUFFIX[Math.floor(r() * SUFFIX.length)]}`;
    if (used.has(name)) continue;
    used.add(name);
    const slug = name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
    const hasSite = r() > 0.35;
    const hasGmb = r() > 0.15;
    const rating = hasGmb ? Math.round((3.2 + r() * 1.8) * 10) / 10 : null;
    const reviews = hasGmb ? Math.floor(r() * 180) : null;
    const f = (p: number, v: string) => (r() < p ? v : NOT_FOUND);
    leads.push({
      id: `demo_${i}_${slug}`,
      businessName: name,
      website: hasSite ? `https://${slug}.example` : NOT_FOUND,
      gmbLink: hasGmb ? `https://maps.google.com/?cid=demo${1000 + i}` : NOT_FOUND,
      email: hasSite ? f(0.7, `info@${slug}.example`) : f(0.15, `${slug}@gmail.example`),
      facebook: f(0.55, `https://www.facebook.com/${slug}`),
      instagram: f(0.35, `@${slug}`),
      tiktok: f(0.1, `@${slug}`),
      youtube: f(0.08, `https://www.youtube.com/@${slug}`),
      phone: `(${200 + Math.floor(r() * 700)}) 555-01${String(Math.floor(r() * 100)).padStart(2, "0")}`,
      meta: {
        address: `${100 + Math.floor(r() * 9000)} Main St, ${cityName}`,
        category: nicheWord,
        rating,
        reviewCount: reviews,
        gmbStatus: gmbStatusFrom(hasGmb, rating, reviews),
        source: "demo",
        websiteReachable: hasSite ? true : null,
      },
    });
  }
  return leads;
}
