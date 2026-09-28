/** Sentinel used for every missing data point. Never leave a field empty. */
export const NOT_FOUND = "Not Found" as const;

export type GmbStatus = "good" | "poor" | "missing" | "unknown";
export type LeadSource = "google" | "osm" | "demo";
export type OutreachStatus = "new" | "emailed" | "whatsapped" | "both";

/** One row of the lead table. All string fields are either real data or "Not Found". */
export interface Lead {
  id: string;
  businessName: string;
  website: string;
  gmbLink: string;
  email: string;
  facebook: string;
  instagram: string;
  tiktok: string;
  youtube: string;
  phone: string;
  meta: {
    address: string;
    category: string;
    rating: number | null;
    reviewCount: number | null;
    gmbStatus: GmbStatus;
    source: LeadSource;
    websiteReachable: boolean | null;
  };
}

export const LEAD_COLUMNS: { key: keyof Omit<Lead, "id" | "meta">; label: string }[] = [
  { key: "businessName", label: "Business Name" },
  { key: "website", label: "Website URL" },
  { key: "gmbLink", label: "GMB Profile Link" },
  { key: "email", label: "Email Address" },
  { key: "facebook", label: "Facebook Page" },
  { key: "instagram", label: "Instagram ID" },
  { key: "tiktok", label: "TikTok ID" },
  { key: "youtube", label: "YouTube Channel" },
  { key: "phone", label: "WhatsApp/Phone Number" },
];

export interface GeneratedMessage {
  subject: string;
  body: string;
  painPoints: string[];
  provider: "groq" | "gemini" | "template";
  generatedAt: string;
}

export interface SenderProfile {
  name: string;
  agency: string;
  /** Optional one-line proof point, e.g. "helped 12 Dallas roofers rank in the map pack" */
  proof: string;
}

/** Events streamed (NDJSON) from /api/leads */
export type LeadStreamEvent =
  | { type: "status"; message: string; progress?: number }
  | { type: "lead"; lead: Lead }
  | { type: "done"; total: number; source: LeadSource }
  | { type: "error"; message: string };

export function isFound(v: string | null | undefined): v is string {
  return !!v && v !== NOT_FOUND && v.trim() !== "" && v.toLowerCase() !== "null";
}

export function orNotFound(v: string | null | undefined): string {
  return isFound(v) ? v.trim() : NOT_FOUND;
}
