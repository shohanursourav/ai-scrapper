import { test } from "node:test";
import assert from "node:assert/strict";
import { extractContacts, normalizeFacebook, normalizeInstagram, normalizeTiktok, normalizeYoutube, formatUsPhone, cleanEmail } from "../src/lib/extract";
import { sanitizeText, sanitizeSubject, findViolations } from "../src/lib/ai/sanitize";
import { BANNED_WORDS, buildUserPrompt, SYSTEM_PROMPT } from "../src/lib/ai/prompt";
import { templateDraft, generateMessage } from "../src/lib/ai/generate";
import { analyzePainPoints, opportunityScore } from "../src/lib/painPoints";
import { whatsappLink, whatsappNumber } from "../src/lib/whatsapp";
import { demoLeads } from "../src/lib/demo";
import { NOT_FOUND, LEAD_COLUMNS, type Lead } from "../src/lib/types";
import { buildMime } from "../src/lib/gmail";
import { seal, unseal } from "../src/lib/session";

const html = `<!doctype html><html><head>
<script type="application/ld+json">{"@type":"RoofingContractor","email":"office@acmeroofing.com","telephone":"+1 512-555-0199","sameAs":["https://www.youtube.com/@acmeroofs","https://www.tiktok.com/@acme.roofs"]}</script>
</head><body>
<a href="https://www.facebook.com/sharer/sharer.php?u=x">share</a>
<a href="https://facebook.com/AcmeRoofingATX/">fb</a>
<a href="https://www.instagram.com/p/abc123/">post</a>
<a href="https://instagram.com/acme_roofing_atx?igsh=1">ig</a>
<a href="https://youtube.com/watch?v=xyz">video</a>
<a href="tel:+15125550100">Call</a>
<a href="/contact-us">Contact</a>
<span class="__cf_email__" data-cfemail="1c7d7f71795c7d7f71796e73737a75727b327f7371">[email protected]</span>
<img src="logo@2x.png"> hello@example.com
<p>Email us: info@acmeroofing.com or call (512) 555-0123</p>
</body></html>`;

test("extractContacts pulls emails, phones, socials, contact pages", () => {
  const c = extractContacts(html, "https://acmeroofing.com/");
  assert.equal(c.facebook, "https://www.facebook.com/AcmeRoofingATX");
  assert.equal(c.instagram, "@acme_roofing_atx");
  assert.equal(c.tiktok, "@acme.roofs");
  assert.equal(c.youtube, "https://www.youtube.com/@acmeroofs");
  assert.ok(c.emails.includes("office@acmeroofing.com"));
  assert.ok(c.emails.includes("info@acmeroofing.com"));
  assert.ok(c.emails.includes("acme@acmeroofing.com"), "decodes Cloudflare email: " + c.emails.join(","));
  assert.ok(!c.emails.some((e) => e.includes("example.com") || e.includes("@2x")));
  assert.ok(c.emails[0].endsWith("@acmeroofing.com"));
  assert.ok(c.phones.includes("(512) 555-0100"));
  assert.deepEqual(c.contactPages, ["https://acmeroofing.com/contact-us"]);
});

test("social normalizers reject non-profile URLs", () => {
  assert.equal(normalizeFacebook("https://www.facebook.com/plugins/page.php"), null);
  assert.equal(normalizeFacebook("https://www.facebook.com/profile.php?id=123"), "https://www.facebook.com/profile.php?id=123");
  assert.equal(normalizeInstagram("https://instagram.com/reel/x"), null);
  assert.equal(normalizeTiktok("https://tiktok.com/tag/roof"), null);
  assert.equal(normalizeYoutube("https://www.youtube.com/embed/abc"), null);
  assert.equal(normalizeYoutube("https://youtube.com/channel/UC123"), "https://www.youtube.com/channel/UC123");
  assert.equal(formatUsPhone("+1 (512) 555-0100"), "(512) 555-0100");
  assert.equal(formatUsPhone("12345"), null);
  assert.equal(cleanEmail("mailto:Info@Biz.com?subject=hi"), "info@biz.com");
});

test("sanitizer removes dashes, banned words, exclamations, emojis", () => {
  const raw = "I hope this email finds you well! Let's delve into your robust online presence — we tailor sites to unlock growth 🚀. In today's digital world, leverage is key – seriously.";
  const out = sanitizeText(raw);
  assert.ok(!/[\u2014\u2013!]/.test(out), out);
  assert.deepEqual(findViolations(out, BANNED_WORDS), [], out);
  assert.ok(!out.includes("🚀"));
  assert.ok(/^Let's dig/.test(out), out);
  assert.equal(sanitizeSubject("Quick question: your website!"), "Quick question your website");
});

test("landscape is allowed for landscaping companies", () => {
  assert.match(sanitizeText("We do landscape design.", { allow: ["landscape"] }), /landscape design/);
  assert.match(sanitizeText("The local landscape is busy."), /local market/);
});

function lead(p: Partial<Lead> = {}, meta: Partial<Lead["meta"]> = {}): Lead {
  return {
    id: "t1", businessName: "Acme Roofing", website: NOT_FOUND, gmbLink: "https://maps.google.com/?cid=1", email: NOT_FOUND,
    facebook: NOT_FOUND, instagram: NOT_FOUND, tiktok: NOT_FOUND, youtube: NOT_FOUND, phone: "(512) 555-0100",
    meta: { address: "Austin, TX", category: "Roofing", rating: 4.8, reviewCount: 120, gmbStatus: "good", source: "google", websiteReachable: null, ...meta },
    ...p,
  };
}

test("pain point priority: website > gmb > social", () => {
  assert.deepEqual(analyzePainPoints(lead()).map((p) => p.key), ["website", "social"]);
  const withSite = lead({ website: "https://acme.com", facebook: "https://facebook.com/acme" }, { gmbStatus: "poor", rating: 3.6, reviewCount: 4 });
  assert.deepEqual(analyzePainPoints(withSite).map((p) => p.key), ["gmb_poor"]);
  const noGmb = lead({ website: "https://acme.com", gmbLink: NOT_FOUND, instagram: "@acme" }, { gmbStatus: "missing" });
  assert.deepEqual(analyzePainPoints(noGmb).map((p) => p.key), ["gmb_missing"]);
  assert.ok(opportunityScore(lead()) > opportunityScore(withSite));
});

test("template drafts follow writing rules for every pain point", () => {
  const variants: Lead[] = [
    lead(),
    lead({ website: "https://a.com" }, { websiteReachable: false }),
    lead({ website: "https://a.com", gmbLink: NOT_FOUND, facebook: "https://facebook.com/a" }, { gmbStatus: "missing" }),
    lead({ website: "https://a.com", facebook: "https://facebook.com/a" }, { gmbStatus: "poor", rating: 3.9, reviewCount: 7 }),
    lead({ website: "https://a.com" }),
    lead({ website: "https://a.com", facebook: "https://facebook.com/a", instagram: "@a" }),
  ];
  for (const l of variants) {
    const d = templateDraft(l, analyzePainPoints(l), { name: "Jordan Smith", agency: "Brightside", proof: "" }, "roofing", "Austin, TX");
    const text = sanitizeText(d.subject + "\n" + d.body);
    assert.deepEqual(findViolations(text, BANNED_WORDS), [], text);
    assert.ok(d.body.includes("Acme Roofing") && d.body.includes("Austin"));
    assert.ok(d.body.trim().endsWith("Jordan\nBrightside"));
    const words = d.body.split(/\s+/).length;
    assert.ok(words >= 40 && words <= 130, `word count ${words}`);
  }
});

test("generateMessage without API keys uses template and returns clean output", async () => {
  delete process.env.GROQ_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const m = await generateMessage(lead(), { name: "", agency: "", proof: "" }, "Roofing", "Austin, TX");
  assert.equal(m.provider, "template");
  assert.ok(m.body.includes("Alex"));
  assert.deepEqual(m.painPoints, ["No website", "No social media"]);
});

test("prompt contains lead data and rules", () => {
  const l = lead();
  const u = buildUserPrompt(l, analyzePainPoints(l), { name: "J", agency: "B", proof: "" }, "Roofing", "Austin, TX");
  assert.match(u, /Website: MISSING/);
  assert.match(u, /1\. No website: pitch website design/);
  assert.match(SYSTEM_PROMPT, /Never use em-dashes/);
});

test("whatsapp links", () => {
  assert.equal(whatsappNumber("(512) 555-0100"), "15125550100");
  assert.equal(whatsappNumber(NOT_FOUND), null);
  assert.equal(whatsappLink("(512) 555-0100", "Hi there,\nquick q"), "https://wa.me/15125550100?text=Hi%20there%2C%0Aquick%20q");
});

test("demo leads always have full structure with Not Found for gaps", () => {
  const leads = demoLeads("Austin, TX", "Roofing", 100);
  assert.equal(leads.length, 100);
  for (const l of leads) for (const c of LEAD_COLUMNS) assert.ok(typeof l[c.key] === "string" && l[c.key].length > 0);
  assert.ok(leads.some((l) => l.website === NOT_FOUND));
});

test("MIME builder strips header injection and encodes UTF-8", () => {
  const raw = buildMime({ from: "me@x.com", to: "a@b.com\r\nBcc: evil@x.com", subject: "héllo", body: "Hi\nthere" });
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  assert.ok(!/\r\nBcc:/.test(decoded));
  assert.match(decoded, /Subject: =\?UTF-8\?B\?/);
});

test("session seal/unseal roundtrip and tamper detection", () => {
  process.env.SESSION_SECRET = "test-secret-at-least-16";
  const v = seal({ a: 1 });
  assert.deepEqual(unseal(v), { a: 1 });
  assert.equal(unseal(v.slice(0, -2) + "xx"), null);
});

test("sanitizer keeps paragraph breaks", () => {
  assert.equal(sanitizeText("Hi there,\n\nQuick one."), "Hi there,\n\nQuick one.");
});
