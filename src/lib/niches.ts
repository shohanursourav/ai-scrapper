/**
 * Niche helpers: search-query variations for Google Places (to get past the
 * 60-results-per-query cap) and OpenStreetMap tag mappings for the keyless fallback.
 */
interface NicheDef {
  match: RegExp;
  variations: string[];
  osm: string[]; // Overpass tag filters, e.g. '["craft"="roofer"]'
}

const NICHES: NicheDef[] = [
  { match: /roof/i, variations: ["roofing contractor", "roofer", "roof repair", "roof replacement", "commercial roofing"], osm: ['["craft"="roofer"]'] },
  { match: /plumb/i, variations: ["plumber", "plumbing company", "emergency plumber", "drain cleaning", "water heater repair"], osm: ['["craft"="plumber"]'] },
  { match: /electric/i, variations: ["electrician", "electrical contractor", "residential electrician", "electrical repair", "commercial electrician"], osm: ['["craft"="electrician"]'] },
  { match: /clean|maid|janitor/i, variations: ["house cleaning service", "maid service", "cleaning company", "commercial cleaning", "carpet cleaning"], osm: ['["craft"="cleaning"]', '["office"="cleaning"]', '["shop"="cleaning"]'] },
  { match: /hvac|air cond|heating|a\/c|ac repair/i, variations: ["HVAC contractor", "air conditioning repair", "heating and cooling", "furnace repair", "AC installation"], osm: ['["craft"="hvac"]', '["craft"="heating_engineer"]'] },
  { match: /paint/i, variations: ["house painter", "painting contractor", "interior painting", "exterior painting", "commercial painting"], osm: ['["craft"="painter"]'] },
  { match: /landscap|lawn|garden/i, variations: ["landscaping company", "lawn care service", "landscaper", "lawn mowing service", "landscape design"], osm: ['["craft"="gardener"]', '["shop"="garden_centre"]', '["craft"="landscaper"]'] },
  { match: /pest|extermin/i, variations: ["pest control", "exterminator", "termite control", "rodent control", "bed bug treatment"], osm: ['["shop"="pest_control"]', '["craft"="pest_control"]'] },
  { match: /carpent|handyman|remodel|contractor/i, variations: ["handyman", "general contractor", "home remodeling", "carpenter", "kitchen remodeling"], osm: ['["craft"="carpenter"]', '["craft"="builder"]', '["office"="construction_company"]'] },
  { match: /locksmith/i, variations: ["locksmith", "emergency locksmith", "residential locksmith", "car locksmith", "lock repair"], osm: ['["shop"="locksmith"]', '["craft"="locksmith"]'] },
  { match: /pool/i, variations: ["pool service", "pool cleaning", "pool repair", "pool builder", "pool maintenance"], osm: ['["shop"="swimming_pool"]'] },
  { match: /garage door/i, variations: ["garage door repair", "garage door company", "garage door installation", "overhead door"], osm: [] },
  { match: /floor/i, variations: ["flooring contractor", "hardwood floor installation", "flooring company", "tile installer"], osm: ['["craft"="floorer"]', '["shop"="flooring"]'] },
];

export function nicheDef(niche: string): NicheDef | undefined {
  return NICHES.find((n) => n.match.test(niche));
}

export function queryVariations(niche: string, city: string): string[] {
  const def = nicheDef(niche);
  const base = niche.trim();
  const list = [base, ...(def?.variations ?? [`${base} company`, `${base} services`, `best ${base}`, `${base} near downtown`])];
  return [...new Set(list.map((v) => v.toLowerCase()))].map((v) => `${v} in ${city.trim()}`);
}

export function osmFilters(niche: string): string[] {
  return nicheDef(niche)?.osm ?? [];
}

export const NICHE_SUGGESTIONS = [
  "Roofing", "Plumbing", "Electrician", "House Cleaning", "HVAC", "Painting", "Landscaping",
  "Pest Control", "Handyman", "Locksmith", "Pool Service", "Garage Door Repair", "Flooring",
];
