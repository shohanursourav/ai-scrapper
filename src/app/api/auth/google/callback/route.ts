import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { GMAIL_COOKIE, STATE_COOKIE, appOrigin, cookieOpts, emailFromIdToken, exchangeCode, redirectUri, sealSession } from "@/lib/gmail";

export const dynamic = "force-dynamic";

/** OAuth redirect target. Verifies state (CSRF), exchanges the code, stores encrypted tokens. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = appOrigin(req);
  const store = await cookies();
  const expected = store.get(STATE_COOKIE)?.value;
  const fail = (reason: string) => NextResponse.redirect(`${origin}/?gmail=error&reason=${encodeURIComponent(reason)}`);

  if (url.searchParams.get("error")) return fail(url.searchParams.get("error")!);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !expected || state !== expected) return fail("invalid_state");

  try {
    const t = await exchangeCode(code, redirectUri(req));
    const session = {
      email: emailFromIdToken(t.id_token),
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: Date.now() + (t.expires_in - 60) * 1000,
    };
    const res = NextResponse.redirect(`${origin}/?gmail=connected`);
    res.cookies.set(GMAIL_COOKIE, sealSession(session), cookieOpts(req, 60 * 60 * 24 * 30));
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (err) {
    console.error("[oauth] callback failed", err);
    return fail("token_exchange_failed");
  }
}
