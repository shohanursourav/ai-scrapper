import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { enrichLead } from "../src/lib/enrich";
import { generateMessage } from "../src/lib/ai/generate";
import { NOT_FOUND, type Lead } from "../src/lib/types";

const base: Lead = {
  id: "x", businessName: "Acme Plumbing", website: NOT_FOUND, gmbLink: "https://maps.google.com/?cid=2", email: NOT_FOUND,
  facebook: NOT_FOUND, instagram: NOT_FOUND, tiktok: NOT_FOUND, youtube: NOT_FOUND, phone: NOT_FOUND,
  meta: { address: "Phoenix, AZ", category: "Plumber", rating: 4.9, reviewCount: 200, gmbStatus: "good", source: "google", websiteReachable: null },
};

test("enrichLead crawls homepage + contact page on a local server", async () => {
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "text/html");
    if (req.url === "/") res.end(`<a href="/contact">Contact</a><a href="https://www.facebook.com/acmeplumbingphx">fb</a>`);
    else if (req.url === "/contact") res.end(`<p>Reach us at service@acmeplumb.com, (602) 555-0142</p><a href="https://instagram.com/acmeplumb">ig</a>`);
    else { res.statusCode = 404; res.end(); }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  try {
    const out = await enrichLead({ ...base, website: `http://127.0.0.1:${port}/` });
    assert.equal(out.facebook, "https://www.facebook.com/acmeplumbingphx");
    assert.equal(out.instagram, "@acmeplumb");
    assert.equal(out.email, "service@acmeplumb.com");
    assert.equal(out.phone, "(602) 555-0142");
    assert.equal(out.tiktok, NOT_FOUND);
    assert.equal(out.meta.websiteReachable, true);

    const dead = await enrichLead({ ...base, website: `http://127.0.0.1:1/` });
    assert.equal(dead.meta.websiteReachable, false);
    assert.equal(dead.email, NOT_FOUND);
  } finally {
    server.close();
  }
});

test("Groq output full of AI fluff gets sanitized", async () => {
  process.env.GROQ_API_KEY = "test";
  const realFetch = globalThis.fetch;
  let sentBody: { messages: { role: string; content: string }[] } | null = null;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sentBody = JSON.parse(String(init.body));
    const content = JSON.stringify({
      subject: "Unlock more calls!",
      body: "Hi there,\n\nI saw Acme Plumbing in Phoenix — you have no Facebook or Instagram. Let's leverage social to elevate your brand!\n\nWorth a quick call?\n\nAlex\nBrightside",
    });
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const m = await generateMessage({ ...base, website: "https://acme.com" }, { name: "Alex", agency: "Brightside", proof: "" }, "Plumbing", "Phoenix, AZ");
    assert.equal(m.provider, "groq");
    assert.ok(!/[\u2014!]/.test(m.body + m.subject), m.body);
    assert.ok(!/leverage|elevate|unlock/i.test(m.body + m.subject), m.body);
    assert.equal(m.subject, "Get more calls");
    assert.ok(sentBody!.messages[1].content.includes("No social media: pitch social media marketing"));
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.GROQ_API_KEY;
  }
});
