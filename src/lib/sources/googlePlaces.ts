import { gmbStatusFrom } from "../gmb";
import { formatUsPhone } from "../extract";
import { queryVariations } from "../niches";
import { NOT_FOUND, orNotFound, type Lead } from "../types";

/**
 * Google Places API (New) Text Search.
 * Docs: https://developers.google.com/maps/documentation/places/web-service/text-search
 * Each page returns up to 20 places and each query can page up to 60 results,
 * so we fan out over several query variations and de-duplicate by place id.
 */
const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.primaryTypeDisplayName",
  "nextPageToken",
].join(",");

interface Place {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  primaryTypeDisplayName?: { text: string };
}

async function searchPage(apiKey: string, textQuery: string, pageToken?: string) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELD_MASK },
    body: JSON.stringify({ textQuery, pageSize: 20, regionCode: "US", languageCode: "en", ...(pageToken ? { pageToken } : {}) }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Google Places error ${res.status}: ${txt.slice(0, 300)}`);
  }
  return (await res.json()) as { places?: Place[]; nextPageToken?: string };
}

function toLead(p: Place, niche: string): Lead {
  const rating = p.rating ?? null;
  const reviews = p.userRatingCount ?? null;
  const phone = formatUsPhone(p.nationalPhoneNumber || p.internationalPhoneNumber || "") || p.internationalPhoneNumber;
  return {
    id: `g_${p.id}`,
    businessName: orNotFound(p.displayName?.text),
    website: orNotFound(p.websiteUri),
    gmbLink: orNotFound(p.googleMapsUri),
    email: NOT_FOUND,
    facebook: NOT_FOUND,
    instagram: NOT_FOUND,
    tiktok: NOT_FOUND,
    youtube: NOT_FOUND,
    phone: orNotFound(phone),
    meta: {
      address: p.formattedAddress || "",
      category: p.primaryTypeDisplayName?.text || niche,
      rating,
      reviewCount: reviews,
      gmbStatus: gmbStatusFrom(!!p.googleMapsUri, rating, reviews),
      source: "google",
      websiteReachable: null,
    },
  };
}

export async function searchGooglePlaces(
  apiKey: string,
  city: string,
  niche: string,
  limit: number,
  onStatus: (msg: string) => void,
): Promise<Lead[]> {
  const seen = new Map<string, Lead>();
  for (const q of queryVariations(niche, city)) {
    if (seen.size >= limit) break;
    let token: string | undefined;
    for (let page = 0; page < 3 && seen.size < limit; page++) {
      onStatus(`Google Places: "${q}" page ${page + 1} (${seen.size} unique so far)`);
      const data = await searchPage(apiKey, q, token);
      for (const p of data.places ?? []) {
        if (p.businessStatus && p.businessStatus !== "OPERATIONAL") continue;
        if (!seen.has(p.id)) seen.set(p.id, toLead(p, niche));
      }
      token = data.nextPageToken;
      if (!token) break;
    }
  }
  // "Qualified" = operating and reachable by at least one channel.
  return [...seen.values()].filter((l) => l.phone !== NOT_FOUND || l.website !== NOT_FOUND).slice(0, limit);
}
