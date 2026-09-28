import { generateMessage } from "@/lib/ai/generate";
import type { Lead, SenderProfile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/generate { lead, sender, niche, city } -> GeneratedMessage */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { lead?: Lead; sender?: SenderProfile; niche?: string; city?: string } | null;
  if (!body?.lead?.businessName) return Response.json({ error: "lead is required" }, { status: 400 });
  try {
    const msg = await generateMessage(body.lead, body.sender ?? { name: "", agency: "", proof: "" }, body.niche ?? "", body.city ?? "");
    return Response.json(msg);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Generation failed" }, { status: 500 });
  }
}
