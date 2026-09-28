import { cookies } from "next/headers";
import { seal, unseal } from "./session";

/**
 * Minimal Google OAuth 2.0 (authorization code flow) + Gmail API send.
 * Scope is gmail.send only: the app can send mail but can never read the inbox.
 */
export const GMAIL_COOKIE = "gmail_session";
export const STATE_COOKIE = "gmail_oauth_state";
export const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.send"];

export interface GmailSession {
  email: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // ms epoch
}

export function oauthConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.SESSION_SECRET);
}

/** Public origin of the app, honoring reverse proxies (needed for the redirect URI). */
export function appOrigin(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = req.headers;
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto")?.split(",")[0] || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export function redirectUri(req: Request) {
  return process.env.GOOGLE_REDIRECT_URI || `${appOrigin(req)}/api/auth/google/callback`;
}

export const cookieOpts = (req: Request, maxAge: number) => ({
  httpOnly: true,
  secure: appOrigin(req).startsWith("https"),
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

export async function readSession(): Promise<GmailSession | null> {
  const store = await cookies();
  return unseal<GmailSession>(store.get(GMAIL_COOKIE)?.value);
}

export async function exchangeCode(code: string, redirect: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirect,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number; id_token?: string };
}

export async function refreshAccessToken(s: GmailSession): Promise<GmailSession> {
  if (!s.refreshToken) throw new Error("Gmail session expired, please reconnect Gmail");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: s.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error("Could not refresh Gmail access, please reconnect Gmail");
  const t = (await res.json()) as { access_token: string; expires_in: number };
  return { ...s, accessToken: t.access_token, expiresAt: Date.now() + (t.expires_in - 60) * 1000 };
}

/** The id_token comes straight from Google's token endpoint over TLS, so decoding without verification is safe here. */
export function emailFromIdToken(idToken?: string): string {
  if (!idToken) return "";
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return payload.email || "";
  } catch {
    return "";
  }
}

const noCrlf = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

function encodeHeader(s: string) {
  // RFC 2047 so non-ASCII subjects/names render correctly
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
}

export function buildMime(opts: { from: string; to: string; subject: string; body: string; fromName?: string }) {
  // Gmail always sends as the authenticated account; From just adds a display name.
  const from = opts.from ? (opts.fromName ? `${encodeHeader(noCrlf(opts.fromName))} <${noCrlf(opts.from)}>` : noCrlf(opts.from)) : "";
  const lines = [
    ...(from ? [`From: ${from}`] : []),
    `To: ${noCrlf(opts.to)}`,
    `Subject: ${encodeHeader(noCrlf(opts.subject))}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(opts.body.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n"),
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

export async function sendGmail(s: GmailSession, raw: string) {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${s.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const txt = await res.text();
    const err = new Error(`Gmail send failed (${res.status}): ${txt.slice(0, 300)}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as { id: string; threadId: string };
}

export function sealSession(s: GmailSession) {
  return seal(s);
}
