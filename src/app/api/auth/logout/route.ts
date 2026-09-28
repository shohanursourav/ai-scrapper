import { NextResponse } from "next/server";
import { GMAIL_COOKIE, readSession } from "@/lib/gmail";

export const dynamic = "force-dynamic";

/** Disconnect Gmail: revoke the token at Google and clear the cookie. */
export async function POST() {
  const s = await readSession().catch(() => null);
  if (s) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(s.refreshToken || s.accessToken)}`, { method: "POST" }).catch(() => {});
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(GMAIL_COOKIE);
  return res;
}
