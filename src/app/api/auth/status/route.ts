import { oauthConfigured, readSession } from "@/lib/gmail";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = oauthConfigured();
  const s = configured ? await readSession() : null;
  return Response.json({ configured, connected: !!s, email: s?.email ?? null });
}
