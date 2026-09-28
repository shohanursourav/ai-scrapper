import { NextResponse } from "next/server";
import { GMAIL_COOKIE, buildMime, cookieOpts, readSession, refreshAccessToken, sealSession, sendGmail } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[a-z]{2,}$/i;

/** POST /api/gmail/send { to, subject, body, fromName? } */
export async function POST(req: Request) {
  let session = await readSession();
  if (!session) return NextResponse.json({ error: "Gmail is not connected" }, { status: 401 });

  const { to = "", subject = "", body = "", fromName = "" } = (await req.json().catch(() => ({}))) as Record<string, string>;
  if (!EMAIL_RE.test(to.trim())) return NextResponse.json({ error: "Enter a valid recipient email address" }, { status: 400 });
  if (!subject.trim() || !body.trim()) return NextResponse.json({ error: "Subject and message are required" }, { status: 400 });

  let refreshed = false;
  try {
    if (Date.now() >= session.expiresAt) {
      session = await refreshAccessToken(session);
      refreshed = true;
    }
    const raw = buildMime({ from: session.email, fromName, to: to.trim(), subject, body });
    let result;
    try {
      result = await sendGmail(session, raw);
    } catch (e) {
      if ((e as { status?: number }).status !== 401) throw e;
      session = await refreshAccessToken(session);
      refreshed = true;
      result = await sendGmail(session, raw);
    }
    const res = NextResponse.json({ ok: true, id: result.id, threadId: result.threadId });
    if (refreshed) res.cookies.set(GMAIL_COOKIE, sealSession(session), cookieOpts(req, 60 * 60 * 24 * 30));
    return res;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Send failed" }, { status: 502 });
  }
}
