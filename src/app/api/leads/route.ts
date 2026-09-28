import { demoLeads } from "@/lib/demo";
import { enrichLead, mapPool } from "@/lib/enrich";
import { searchGooglePlaces } from "@/lib/sources/googlePlaces";
import { searchOsm } from "@/lib/sources/osm";
import type { Lead, LeadSource, LeadStreamEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * POST /api/leads  { city, niche, limit?, demo? }
 * Streams NDJSON events so the table fills in live while websites are crawled.
 */
export async function POST(req: Request) {
  const { city = "", niche = "", limit = 100, demo = false } = (await req.json().catch(() => ({}))) as {
    city?: string; niche?: string; limit?: number; demo?: boolean;
  };
  if (!city.trim() || !niche.trim()) return Response.json({ error: "City and niche are required" }, { status: 400 });
  const max = Math.max(1, Math.min(200, Number(limit) || 100));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: LeadStreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      const status = (message: string, progress?: number) => send({ type: "status", message, progress });
      try {
        let base: Lead[];
        let source: LeadSource;
        if (demo) {
          source = "demo";
          status("Generating demo leads (sample data, not real businesses)...");
          base = demoLeads(city, niche, max);
          for (const [i, lead] of base.entries()) {
            send({ type: "lead", lead });
            if (i % 10 === 0) await new Promise((r) => setTimeout(r, 60));
          }
          send({ type: "done", total: base.length, source });
          controller.close();
          return;
        }
        if (process.env.GOOGLE_PLACES_API_KEY) {
          source = "google";
          base = await searchGooglePlaces(process.env.GOOGLE_PLACES_API_KEY, city, niche, max, (m) => status(m, 5));
        } else {
          source = "osm";
          status("No GOOGLE_PLACES_API_KEY set, using free OpenStreetMap data (fewer results, no GMB data).");
          base = await searchOsm(city, niche, max, (m) => status(m, 5));
        }
        if (!base.length) {
          send({ type: "error", message: `No businesses found for "${niche}" in "${city}". Try a broader niche or add a Google Places key.` });
          controller.close();
          return;
        }
        status(`Found ${base.length} businesses. Crawling websites for emails and social profiles...`, 10);
        let done = 0;
        await mapPool(base, 8, (l) => enrichLead(l).catch(() => l), (lead) => {
          done++;
          send({ type: "lead", lead });
          status(`Enriched ${done}/${base.length}: ${lead.businessName}`, 10 + Math.round((done / base.length) * 90));
        });
        send({ type: "done", total: base.length, source });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Lead search failed";
        send({
          type: "error",
          message: msg === "fetch failed" ? "Network error: could not reach the data provider. Check the server's internet connection, or try Demo mode." : msg,
        });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
