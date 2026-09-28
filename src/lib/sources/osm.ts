import { formatUsPhone, normalizeFacebook, normalizeInstagram, normalizeTiktok, normalizeYoutube } from "../extract";
import { osmFilters } from "../niches";
import { NOT_FOUND, orNotFound, type Lead } from "../types";

/**
 * Keyless fallback: OpenStreetMap Nominatim (geocoding) + Overpass API (POI search).
 * 100% free, no API key. Coverage for US home-service businesses is thinner than
 * Google, and there is no GMB data, so gmbStatus is "unknown".
 * Usage policies: https://operations.osmfoundation.org/policies/nominatim/
 */
const UA = "LocalLeadCRM/1.0 (open-source lead research tool)";
const OVERPASS = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";

async function geocodeCity(city: string): Promise<[number, number, number, number]> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(city)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Nominatim error ${res.status}`);
  const data = (await res.json()) as { boundingbox: string[] }[];
  if (!data.length) throw new Error(`Could not find the US city "${city}"`);
  const [s, n, w, e] = data[0].boundingbox.map(Number);
  return [s, w, n, e];
}

function escapeRegex(s: string) {
  return s.replace(/[\\"^$.*+?()[\]{}|]/g, "");
}

export async function searchOsm(city: string, niche: string, limit: number, onStatus: (m: string) => void): Promise<Lead[]> {
  onStatus(`Geocoding ${city} with OpenStreetMap...`);
  const [s, w, n, e] = await geocodeCity(city);
  const bbox = `${s},${w},${n},${e}`;
  const word = escapeRegex(niche.trim().split(/\s+/)[0].replace(/ing$/i, ""));
  const filters = [...osmFilters(niche), `["name"~"${word}",i]["shop"]`, `["name"~"${word}",i]["craft"]`, `["name"~"${word}",i]["office"]`];
  const body = `[out:json][timeout:60];(${filters.map((f) => `nwr${f}(${bbox});`).join("")});out tags center ${limit * 2};`;

  onStatus("Querying Overpass API for businesses...");
  const res = await fetch(OVERPASS, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
    body: "data=" + encodeURIComponent(body),
  });
  if (!res.ok) throw new Error(`Overpass error ${res.status}`);
  const data = (await res.json()) as { elements: { id: number; type: string; tags?: Record<string, string> }[] };

  const leads: Lead[] = [];
  const names = new Set<string>();
  for (const el of data.elements) {
    const t = el.tags || {};
    if (!t.name || names.has(t.name.toLowerCase())) continue;
    names.add(t.name.toLowerCase());
    const web = t.website || t["contact:website"] || t.url;
    const fb = t["contact:facebook"] || t.facebook;
    const ig = t["contact:instagram"] || t.instagram;
    const tt = t["contact:tiktok"] || t.tiktok;
    const yt = t["contact:youtube"] || t.youtube;
    const phoneRaw = t.phone || t["contact:phone"] || t["contact:mobile"] || "";
    const addr = [t["addr:housenumber"], t["addr:street"], t["addr:city"], t["addr:state"]].filter(Boolean).join(" ");
    leads.push({
      id: `osm_${el.type}_${el.id}`,
      businessName: t.name,
      website: orNotFound(web && (/^https?:/i.test(web) ? web : `https://${web}`)),
      gmbLink: NOT_FOUND,
      email: orNotFound(t.email || t["contact:email"]),
      facebook: orNotFound(fb && (normalizeFacebook(fb.startsWith("http") ? fb : `https://facebook.com/${fb}`) || null)),
      instagram: orNotFound(ig && (normalizeInstagram(ig.startsWith("http") ? ig : `https://instagram.com/${ig.replace(/^@/, "")}`) || null)),
      tiktok: orNotFound(tt && (normalizeTiktok(tt.startsWith("http") ? tt : `https://tiktok.com/@${tt.replace(/^@/, "")}`) || null)),
      youtube: orNotFound(yt && (normalizeYoutube(yt) || null)),
      phone: orNotFound(formatUsPhone(phoneRaw.split(";")[0]) || null),
      meta: { address: addr, category: t.craft || t.shop || t.office || niche, rating: null, reviewCount: null, gmbStatus: "unknown", source: "osm", websiteReachable: null },
    });
    if (leads.length >= limit) break;
  }
  return leads;
}
