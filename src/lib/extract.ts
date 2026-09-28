import * as cheerio from "cheerio";

/**
 * Pure HTML -> contact/social extraction. No network here, so it is easy to test.
 */
export interface ExtractedContacts {
  emails: string[];
  phones: string[];
  facebook: string | null;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  whatsapp: string | null;
  /** Internal links that look like contact/about pages, absolute URLs */
  contactPages: string[];
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/gi;

const JUNK_EMAIL_PARTS = [
  "example.com", "domain.com", "email.com", "yourdomain", "yourcompany", "sentry", "wixpress",
  "godaddy", "squarespace", "wordpress", "schema.org", "w3.org", "u003e", "@2x", "@3x",
  "no-reply", "noreply", "donotreply", "privacy@", "abuse@", "webmaster@", "user@", "name@",
];
const JUNK_EMAIL_TLDS = /\.(png|jpe?g|gif|svg|webp|avif|css|js|ico|mp4|woff2?)$/i;

export function cleanEmail(raw: string): string | null {
  let e = raw.trim().toLowerCase().replace(/^mailto:/, "").split("?")[0];
  try {
    e = decodeURIComponent(e);
  } catch {
    /* keep raw */
  }
  e = e.replace(/^[^a-z0-9]+/, "").replace(/[^a-z0-9]+$/, "");
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}$/.test(e)) return null;
  if (JUNK_EMAIL_TLDS.test(e)) return null;
  if (JUNK_EMAIL_PARTS.some((j) => e.includes(j))) return null;
  return e;
}

/** Cloudflare "email protection" obfuscation, very common on small business sites. */
export function decodeCfEmail(hex: string): string | null {
  try {
    const key = parseInt(hex.slice(0, 2), 16);
    let out = "";
    for (let i = 2; i < hex.length; i += 2) {
      out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
    }
    return out;
  } catch {
    return null;
  }
}

function safeUrl(href: string, base?: string): URL | null {
  try {
    return new URL(href, base);
  } catch {
    return null;
  }
}

const FB_BLOCK = /^(sharer|share|plugins|dialog|tr|login|groups\/?$|events|watch|hashtag|policies|help|privacy|l\.php|photo|story\.php|permalink\.php|profile\.php$)/i;

export function normalizeFacebook(href: string): string | null {
  const u = safeUrl(href);
  if (!u || !/(^|\.)facebook\.com$|(^|\.)fb\.com$|^fb\.me$/i.test(u.hostname)) return null;
  const path = u.pathname.replace(/^\/+|\/+$/g, "");
  if (!path) return null;
  if (path.toLowerCase() === "profile.php") {
    const id = u.searchParams.get("id");
    return id ? `https://www.facebook.com/profile.php?id=${id}` : null;
  }
  if (FB_BLOCK.test(path)) return null;
  // keep "pages/Name/123" and plain "/slug"
  const clean = path.split("/").slice(0, path.toLowerCase().startsWith("pages") ? 3 : 1).join("/");
  return `https://www.facebook.com/${clean}`;
}

const IG_BLOCK = new Set(["p", "reel", "reels", "explore", "stories", "tv", "accounts", "about", "developer", "legal", "direct"]);

export function normalizeInstagram(href: string): string | null {
  const u = safeUrl(href);
  if (!u || !/(^|\.)instagram\.com$|^instagr\.am$/i.test(u.hostname)) return null;
  const first = u.pathname.split("/").filter(Boolean)[0];
  if (!first || IG_BLOCK.has(first.toLowerCase())) return null;
  if (!/^[a-z0-9._]{1,30}$/i.test(first)) return null;
  return `@${first}`;
}

export function normalizeTiktok(href: string): string | null {
  const u = safeUrl(href);
  if (!u || !/(^|\.)tiktok\.com$/i.test(u.hostname)) return null;
  const first = u.pathname.split("/").filter(Boolean)[0];
  if (!first || !first.startsWith("@")) return null;
  const handle = first.slice(1);
  if (!/^[a-z0-9._]{2,24}$/i.test(handle)) return null;
  return `@${handle}`;
}

export function normalizeYoutube(href: string): string | null {
  const u = safeUrl(href);
  if (!u || !/(^|\.)youtube\.com$/i.test(u.hostname)) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (!parts.length) return null;
  const [a, b] = parts;
  if (a.startsWith("@")) return `https://www.youtube.com/${a}`;
  if (["channel", "c", "user"].includes(a.toLowerCase()) && b) return `https://www.youtube.com/${a}/${b}`;
  return null; // watch?v=, embed/, playlist etc are not channels
}

export function normalizeWhatsapp(href: string): string | null {
  const u = safeUrl(href);
  if (!u) return null;
  if (/^wa\.me$/i.test(u.hostname)) {
    const d = u.pathname.replace(/\D/g, "");
    return d.length >= 10 ? d : null;
  }
  if (/whatsapp\.com$/i.test(u.hostname)) {
    const d = (u.searchParams.get("phone") || "").replace(/\D/g, "");
    return d.length >= 10 ? d : null;
  }
  return null;
}

/** Format a US phone number as (555) 555-5555. Returns null if it is not a plausible US number. */
export function formatUsPhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length !== 10 || /^[01]/.test(d)) return null;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

const PHONE_TEXT_RE = /(?:\+?1[\s.-]?)?\(?\b[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

export function extractContacts(html: string, pageUrl: string): ExtractedContacts {
  const $ = cheerio.load(html);
  const emails = new Set<string>();
  const phones = new Set<string>();
  const out: ExtractedContacts = {
    emails: [], phones: [], facebook: null, instagram: null, tiktok: null, youtube: null, whatsapp: null, contactPages: [],
  };
  const contactPages = new Set<string>();
  const base = safeUrl(pageUrl);

  const consider = (href: string) => {
    if (!href) return;
    const h = href.trim();
    if (/^mailto:/i.test(h)) {
      const e = cleanEmail(h);
      if (e) emails.add(e);
      return;
    }
    if (/^tel:/i.test(h)) {
      const p = formatUsPhone(h.slice(4));
      if (p) phones.add(p);
      return;
    }
    out.facebook ??= normalizeFacebook(h);
    out.instagram ??= normalizeInstagram(h);
    out.tiktok ??= normalizeTiktok(h);
    out.youtube ??= normalizeYoutube(h);
    out.whatsapp ??= normalizeWhatsapp(h);

    const abs = safeUrl(h, pageUrl);
    if (abs && base && abs.hostname.replace(/^www\./, "") === base.hostname.replace(/^www\./, "")) {
      if (/contact|about|reach|get-in-touch|quote/i.test(abs.pathname) && abs.pathname !== base.pathname) {
        abs.hash = "";
        contactPages.add(abs.toString());
      }
    }
  };

  $("a[href], link[href]").each((_, el) => consider($(el).attr("href") || ""));
  $("iframe[src]").each((_, el) => consider($(el).attr("src") || ""));

  // Cloudflare protected emails
  $("[data-cfemail]").each((_, el) => {
    const e = decodeCfEmail($(el).attr("data-cfemail") || "");
    const c = e && cleanEmail(e);
    if (c) emails.add(c);
  });
  $('a[href*="/cdn-cgi/l/email-protection#"]').each((_, el) => {
    const hex = ($(el).attr("href") || "").split("#")[1] || "";
    const e = decodeCfEmail(hex);
    const c = e && cleanEmail(e);
    if (c) emails.add(c);
  });

  // JSON-LD structured data (LocalBusiness: email, telephone, sameAs)
  $('script[type="application/ld+json"]').each((_, el) => {
    const txt = $(el).contents().text();
    try {
      const walk = (node: unknown): void => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) return node.forEach(walk);
        const o = node as Record<string, unknown>;
        if (typeof o.email === "string") {
          const e = cleanEmail(o.email);
          if (e) emails.add(e);
        }
        if (typeof o.telephone === "string") {
          const p = formatUsPhone(o.telephone);
          if (p) phones.add(p);
        }
        const same = o.sameAs;
        if (typeof same === "string") consider(same);
        if (Array.isArray(same)) same.forEach((s) => typeof s === "string" && consider(s));
        Object.values(o).forEach(walk);
      };
      walk(JSON.parse(txt));
    } catch {
      /* invalid JSON-LD is common, ignore */
    }
  });

  // Plain-text emails & phones (strip scripts/styles first)
  $("script, style, noscript, svg").remove();
  // Join text nodes with spaces: .text() would glue "555-0142" + "Instagram" into one token.
  const parts: string[] = [];
  const walk = (nodes: ReturnType<typeof $>) =>
    nodes.contents().each((_, n) => {
      if (n.type === "text") parts.push(n.data);
      else if (n.type === "tag") walk($(n));
    });
  walk($.root());
  const text = parts.join(" ");
  for (const m of text.match(EMAIL_RE) || []) {
    const e = cleanEmail(m);
    if (e) emails.add(e);
  }
  for (const m of text.match(PHONE_TEXT_RE) || []) {
    const p = formatUsPhone(m);
    if (p) phones.add(p);
  }

  out.emails = rankEmails([...emails], base?.hostname);
  out.phones = [...phones];
  out.contactPages = [...contactPages].slice(0, 3);
  return out;
}

/** Prefer emails on the business's own domain, then info@/contact@/office@ style inboxes. */
export function rankEmails(emails: string[], host?: string): string[] {
  const domain = host?.replace(/^www\./, "").toLowerCase();
  const score = (e: string) => {
    let s = 0;
    if (domain && e.endsWith("@" + domain)) s += 10;
    if (/^(info|contact|office|hello|sales|service|admin|support|team|estimates?|quotes?)@/.test(e)) s += 3;
    if (/@(gmail|yahoo|outlook|hotmail|aol|icloud)\./.test(e)) s += 1;
    return s;
  };
  return [...emails].sort((a, b) => score(b) - score(a));
}
