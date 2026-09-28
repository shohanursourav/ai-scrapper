import { extractContacts, type ExtractedContacts } from "./extract";
import { NOT_FOUND, isFound, type Lead } from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const MAX_BYTES = 1_500_000;

/** Fetch a page as text with a hard timeout and size cap. Returns null on any failure. */
export async function fetchHtml(url: string, timeoutMs = 9000): Promise<{ html: string; finalUrl: string } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (ct && !ct.includes("html")) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        break;
      }
    }
    const html = new TextDecoder().decode(Buffer.concat(chunks));
    return { html, finalUrl: res.url || url };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function merge(a: ExtractedContacts, b: ExtractedContacts): ExtractedContacts {
  return {
    emails: [...new Set([...a.emails, ...b.emails])],
    phones: [...new Set([...a.phones, ...b.phones])],
    facebook: a.facebook ?? b.facebook,
    instagram: a.instagram ?? b.instagram,
    tiktok: a.tiktok ?? b.tiktok,
    youtube: a.youtube ?? b.youtube,
    whatsapp: a.whatsapp ?? b.whatsapp,
    contactPages: a.contactPages,
  };
}

/**
 * Crawl the lead's website (homepage + up to 2 contact/about pages) and fill
 * in any missing email / social / phone fields. Existing values are never overwritten.
 */
export async function enrichLead(lead: Lead): Promise<Lead> {
  if (!isFound(lead.website)) return { ...lead, meta: { ...lead.meta, websiteReachable: null } };

  let url = lead.website;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;

  const home = await fetchHtml(url);
  if (!home) return { ...lead, meta: { ...lead.meta, websiteReachable: false } };

  let found = extractContacts(home.html, home.finalUrl);
  const needsMore = () => found.emails.length === 0 || !found.facebook || !found.instagram;
  for (const page of found.contactPages.slice(0, 2)) {
    if (!needsMore()) break;
    const sub = await fetchHtml(page, 7000);
    if (sub) found = merge(found, extractContacts(sub.html, sub.finalUrl));
  }

  const pick = (current: string, next: string | null | undefined) => (isFound(current) ? current : next || NOT_FOUND);

  return {
    ...lead,
    email: pick(lead.email, found.emails[0]),
    facebook: pick(lead.facebook, found.facebook),
    instagram: pick(lead.instagram, found.instagram),
    tiktok: pick(lead.tiktok, found.tiktok),
    youtube: pick(lead.youtube, found.youtube),
    phone: pick(lead.phone, found.phones[0] ?? (found.whatsapp ? `+${found.whatsapp}` : null)),
    meta: { ...lead.meta, websiteReachable: true },
  };
}

/** Run async tasks with a concurrency cap, invoking onResult as each finishes. */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
  onResult?: (r: R, i: number) => void | Promise<void>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
      await onResult?.(results[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
