import { activeProvider } from "@/lib/ai/generate";
import { oauthConfigured } from "@/lib/gmail";

export const dynamic = "force-dynamic";

/** Tells the UI which free services are configured (never exposes the keys). */
export async function GET() {
  return Response.json({
    leadSource: process.env.GOOGLE_PLACES_API_KEY ? "google" : "osm",
    aiProvider: activeProvider(),
    gmailOAuth: oauthConfigured(),
  });
}
