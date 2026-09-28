import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { SCOPES, STATE_COOKIE, cookieOpts, oauthConfigured, redirectUri } from "@/lib/gmail";

export const dynamic = "force-dynamic";

/** GET /api/auth/google -> redirects to Google's consent screen */
export async function GET(req: Request) {
  if (!oauthConfigured()) {
    return NextResponse.json({ error: "Gmail OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and SESSION_SECRET." }, { status: 500 });
  }
  const state = crypto.randomBytes(24).toString("base64url");
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(req),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  res.cookies.set(STATE_COOKIE, state, cookieOpts(req, 600));
  return res;
}
