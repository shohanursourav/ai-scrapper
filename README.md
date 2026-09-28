# Local Lead CRM

Lead generation and personalized outreach for US home service businesses (roofing, plumbing, cleaning, electricians, HVAC and more).

**Flow:** Search (City + Niche) → Scrape → Enrich (website crawl) → AI pain-point analysis → Edit message → Send via Gmail or WhatsApp.

Everything uses free tiers, open-source libraries, or zero-cost URL schemes. There is no database: CRM state lives in your browser's `localStorage`.

| Feature | How it stays free |
|---|---|
| Business discovery | Google Places API (New) monthly free usage, **or** OpenStreetMap Nominatim + Overpass (no key at all) |
| Email / social enrichment | Our own crawler (`fetch` + Cheerio) visits each business website |
| AI messages | Groq free/developer tier **or** Google Gemini free tier (built-in template fallback when neither is set) |
| Email sending | Gmail API with the user's own Google account through OAuth 2.0 (`gmail.send` scope only) |
| WhatsApp | `https://wa.me/<number>?text=<message>` deep links, so there is no WhatsApp Business API cost |
| Hosting | Runs locally with `npm run dev`, or on Vercel's free Hobby plan |

---

## Quick start

```bash
npm install
cp .env.example .env.local     # optional, the app runs without any keys
npm run dev                    # http://localhost:3000
```

With **no keys** you get: OpenStreetMap leads, website enrichment, template-written messages, WhatsApp links, and a "Open in Gmail compose" fallback. Tick **Demo mode** to explore the UI with clearly fake sample data (`.example` domains, `555-01xx` numbers), no network calls needed.

```bash
npm test          # 15 unit + integration tests (extraction, sanitizer, pain points, OAuth MIME, crypto)
npm run build     # production build
```

---

## Code structure

```
src/
├── app/
│   ├── page.tsx                         # Renders <Dashboard/>
│   ├── layout.tsx, globals.css          # Tailwind v4
│   └── api/
│       ├── leads/route.ts               # POST: search + enrich, streams NDJSON events (live table fill)
│       ├── generate/route.ts            # POST: lead -> { subject, body, painPoints, provider }
│       ├── config/route.ts              # GET: which free services are configured (no secrets)
│       ├── auth/google/route.ts         # GET: start OAuth (state cookie + redirect to Google)
│       ├── auth/google/callback/route.ts# GET: verify state, exchange code, store encrypted tokens
│       ├── auth/status/route.ts         # GET: { configured, connected, email }
│       ├── auth/logout/route.ts         # POST: revoke token + clear cookie
│       └── gmail/send/route.ts          # POST: { to, subject, body } -> Gmail API (auto token refresh)
├── components/
│   ├── Dashboard.tsx                    # Search bar, stats, filters, bulk writer, CSV export
│   ├── LeadTable.tsx                    # Scrollable table with check / red X status icons
│   ├── ActionPanel.tsx                  # Side panel: details, editable message, Gmail + WhatsApp CTAs
│   ├── SettingsModal.tsx                # Sender name / agency / proof line
│   ├── useCrmStore.ts                   # localStorage-backed CRM state
│   └── icons.tsx
└── lib/
    ├── types.ts                         # Lead model, NOT_FOUND sentinel ("Not Found")
    ├── sources/googlePlaces.ts          # Places API (New) Text Search, query fan-out to reach 100
    ├── sources/osm.ts                   # Keyless fallback: Nominatim + Overpass
    ├── enrich.ts                        # Website crawler (homepage + up to 2 contact/about pages)
    ├── extract.ts                       # Pure HTML parsing: emails, phones, FB/IG/TikTok/YouTube, JSON-LD, Cloudflare emails
    ├── niches.ts                        # Query variations + OSM tag mapping per niche
    ├── gmb.ts                           # GMB quality: missing / poor / good
    ├── painPoints.ts                    # Deterministic pain-point analysis + opportunity score
    ├── ai/prompt.ts                     # SYSTEM PROMPT + per-lead user prompt + banned words
    ├── ai/generate.ts                   # Groq -> Gemini -> template fallback chain
    ├── ai/sanitize.ts                   # Post-processing: strips dashes, banned words, "!", emojis
    ├── gmail.ts                         # OAuth helpers, RFC 2822 MIME builder, send
    ├── session.ts                       # AES-256-GCM sealed cookies
    ├── whatsapp.ts                      # wa.me link builder
    └── demo.ts                          # Fake sample data for Demo mode
tests/                                   # node:test via tsx
```

### Data columns and null handling

Every lead always has all 9 columns: **Business Name, Website URL, GMB Profile Link, Email Address, Facebook Page, Instagram ID, TikTok ID, YouTube Channel, WhatsApp/Phone Number**. A missing value is always the literal string `"Not Found"` (`NOT_FOUND` in `lib/types.ts`), both in the API stream and in the CSV export. The table shows a green check for found and a red X for Not Found. An amber check on GMB means the profile exists but is weak (fewer than 15 reviews or under 4.0 stars).

### How we reach 100 leads

Google's Text Search returns at most 20 places per page and 60 per query. `niches.ts` expands the niche into variations (e.g. roofing → "roofing contractor", "roofer", "roof repair", "roof replacement", "commercial roofing"), runs each one, and de-duplicates by place ID until the limit is reached. Permanently closed businesses and businesses with no phone and no website are dropped ("qualified" = operating and reachable).

Then every website is crawled (8 in parallel, 9s timeout, 1.5 MB cap). The crawler reads `mailto:`/`tel:` links, social links, JSON-LD `sameAs`/`email`/`telephone`, Cloudflare-obfuscated emails and plain text, and follows up to 2 contact/about pages when the homepage is missing an email or socials.

---

## API setup

### 1. Google Places API (recommended for full 100-lead results + GMB data)

1. Go to <https://console.cloud.google.com/>, create a project.
2. **APIs & Services → Library →** enable **Places API (New)**.
3. **APIs & Services → Credentials → Create credentials → API key.** Restrict it to *Places API (New)*.
4. Billing must be enabled on the project, but Google gives a monthly free usage allowance per Places SKU. We request website/phone/rating fields, which bill under the Text Search *Enterprise* SKU. A 100-lead search is roughly 5 to 15 requests. Check current free caps at <https://mapsplatform.google.com/pricing/> and set a **budget alert + quota cap** (APIs & Services → Places API (New) → Quotas) so you can never be charged.
5. Put the key in `.env.local` as `GOOGLE_PLACES_API_KEY`.

Without this key the app uses OpenStreetMap. That is fully free but US coverage of small trades is patchy (often fewer than 100 results) and there is no GMB data, so GMB-based pitches are skipped for those leads.

### 2. AI provider (pick one)

- **Groq:** create a key at <https://console.groq.com/keys> → `GROQ_API_KEY`. Default model is `openai/gpt-oss-20b` (override with `GROQ_MODEL`). Llama 3.3 70B is now listed as enterprise-only on Groq, so it is not the default.
- **Gemini:** create a key at <https://aistudio.google.com/apikey> → `GEMINI_API_KEY`. Default model `gemini-2.5-flash` (override with `GEMINI_MODEL`).

If both are set, Groq is tried first and Gemini is the automatic backup. If neither is set, or both fail, a rule-following template writes the message, so outreach is never blocked. "Write all messages" throttles requests to stay inside free-tier rate limits.

### 3. Gmail OAuth 2.0

1. In the same Google Cloud project: **APIs & Services → Library →** enable **Gmail API**.
2. **Google Auth Platform (OAuth consent screen):** User type **External**. Fill in app name + support email.
   - **Data access / Scopes:** add `openid`, `.../auth/userinfo.email` and `https://www.googleapis.com/auth/gmail.send`.
   - **Audience → Test users:** add the Gmail address(es) you will send from.
3. **Clients → Create client → Web application.**
   - Authorized redirect URI: `http://localhost:3000/api/auth/google/callback` (plus your deployed URL, e.g. `https://your-app.vercel.app/api/auth/google/callback`).
4. Copy the client ID and secret into `.env.local`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and set `SESSION_SECRET` (`openssl rand -base64 32`).
5. Restart `npm run dev` and click **Connect Gmail**.

Notes:
- `gmail.send` is a *sensitive* scope. In **Testing** mode it works for up to 100 test users with no Google review, but you will see an "unverified app" screen (click *Continue*) and refresh tokens expire after 7 days, so you reconnect weekly. To remove both, publish the app and complete Google's verification.
- Security: tokens are stored in an AES-256-GCM encrypted, `httpOnly`, `SameSite=Lax` cookie. They never reach browser JavaScript. OAuth `state` is checked against a short-lived cookie to block CSRF. The app can send mail but cannot read your inbox. Disconnect revokes the token at Google.
- Behind a proxy or custom domain, the redirect URI is auto-detected from `X-Forwarded-Host`. Set `APP_URL` or `GOOGLE_REDIRECT_URI` to override.

### 4. WhatsApp

No setup. "Send via WhatsApp" opens `https://wa.me/1XXXXXXXXXX?text=<your edited message>` in a new tab, which hands off to WhatsApp Web or the app. US 10-digit numbers automatically get the `1` country code. You press send inside WhatsApp yourself, so no WhatsApp Business API cost. Note that many business numbers are landlines without WhatsApp.

---

## AI message generation

### Pipeline

1. **`painPoints.ts` (code, not AI) decides what to pitch**, in priority order:
   - Website = Not Found → *website design/development*
   - Website found but did not load → *fix or rebuild the site*
   - GMB = Not Found → *local SEO + Google Business Profile setup*
   - GMB poor (under 15 reviews or under 4.0 stars) → *GMB optimization + reviews*
   - No Facebook and no Instagram (or all 4 socials missing) → *social media marketing/growth*
   - Nothing missing → offer a free 5 minute audit
2. The LLM gets the system prompt below plus the lead data and ranked pain points. It must return JSON `{subject, body}`.
3. **`sanitize.ts` enforces the style rules deterministically:** em/en dashes become commas, banned words are swapped for plain ones (for example *leverage* → *use*, *unlock* → *get*), `!` becomes `.`, emojis and "hope this finds you well" are removed. If anything still violates the rules, the template version is used instead. (*landscape* is allowed for landscaping companies.)
4. The panel also runs a live style check while you edit.

### The exact system prompt (`src/lib/ai/prompt.ts`)

```text
You write cold outreach emails for a small local marketing agency. Your emails read like a real person typed them in two minutes. They get replies because they are short, specific and useful.

TASK
Write ONE email to the owner of a local home services business. You will get the business data and a list of PAIN POINTS that were detected by code. Pitch ONLY the first pain point as the main offer. You may mention a second pain point in one short sentence at most. Never pitch something that is not in the list.

HOW EACH PAIN POINT SHOULD BE PITCHED
- No website: people search "[service] near me", find competitors with a site, and call them instead. A simple site with a click-to-call button and a quote form turns those searches into calls.
- Website not loading: we tried to visit their site and it did not load. Every visitor who hits that page leaves and calls someone else.
- No Google Business Profile: they do not show up in the Google map results, which is where most local calls come from.
- Weak Google profile: few reviews or a low rating means the map pack shows competitors first. A review system and a cleaned-up profile moves them up and wins more calls.
- No social media: homeowners check Facebook and Instagram before hiring. Posting real job photos builds trust and brings referrals and repeat work.

WRITING RULES (STRICT)
1. Sound like a human marketer sending a casual 1-to-1 email. Plain, friendly, direct.
2. Use short sentences. Most sentences under 15 words. No sentence over 22 words.
3. Body length: 60 to 110 words. 3 or 4 short paragraphs. No bullet points. No headings.
4. Never use em-dashes or en-dashes. Use commas or periods instead.
5. Never use these words or phrases: delve, robust, landscape, tailor, tailored, revolutionize, unlock, leverage, elevate, seamless, seamlessly, game-changer, game changer, cutting-edge, empower, synergy, harness, navigate, realm, furthermore, moreover, utilize, streamline, supercharge, skyrocket, digital presence, online presence, in today's, boost your, take your business to the next level, i hope this email finds you well, i hope this finds you well, look no further, testament.
6. No hype, no exclamation marks, no emojis, no buzzwords, no "I noticed you're a leader in your industry" flattery.
7. Mention the business name once and the city once. Refer to their exact missing asset.
8. Tie the fix to one concrete outcome: more calls, more quote requests, or more local jobs.
9. End with one low-pressure question as the call to action, like "Want me to send over a quick mockup?" or "Worth a 10 minute call this week?"
10. Sign off with the sender's first name and agency on separate lines. If the sender name is missing, sign off as "Alex".
11. Subject line: 2 to 6 words, lowercase is fine, no clickbait, no colons. Example: "quick question about your website".
12. Do not invent facts, numbers, reviews, or past clients. Only use the proof line if one is given.

OUTPUT FORMAT
Return only valid JSON with exactly these keys:
{"subject": "string", "body": "string"}
Use \n for line breaks inside body. No markdown, no extra keys, no commentary.
```

### Example user prompt (built per lead by `buildUserPrompt`)

```text
BUSINESS DATA
Name: Lone Star Roofing Co
Niche: Roofing
City: Austin, TX
Website: MISSING
Google Business Profile: found, 4.2 stars, 9 reviews
Facebook: https://www.facebook.com/lonestarroofingco
Instagram: MISSING
TikTok: MISSING
YouTube: MISSING

PAIN POINTS (in priority order, pitch the first one)
1. No website: pitch website design and development
2. Weak Google profile (4.2 stars from 9 reviews): pitch local SEO and Google Business Profile optimization, including getting more reviews

SENDER
Name: Jordan Smith
Agency: Brightside Local
Proof line: none, do not invent one

Write the email now. JSON only.
```

Settings: temperature 0.7, JSON response mode (`response_format: json_object` on Groq, `responseMimeType: application/json` on Gemini), low reasoning effort on gpt-oss, thinking disabled on Gemini 2.5 Flash.

---

## Deploying for free (Vercel)

1. Push to GitHub and import the repo at <https://vercel.com/new>.
2. Add the env vars from `.env.example` in Project Settings → Environment Variables.
3. Add `https://<your-app>.vercel.app/api/auth/google/callback` to the OAuth client's redirect URIs.

`/api/leads` streams for up to 300 seconds (`maxDuration`). If your plan's function limit is lower and searches time out, choose 50 leads instead of 100.

---

## Responsible use

- **CAN-SPAM (US):** cold B2B email is legal in the US if you use accurate headers and subject lines, include your physical mailing address, and honor opt-out requests within 10 business days. Add your address and a line like "Reply 'no thanks' and I won't follow up" to your signature (Settings, or edit per message).
- Send in small batches from a warmed-up account. Gmail has daily sending limits, and high bounce/complaint rates will hurt your account.
- The crawler only reads public business websites, uses timeouts, and makes a few requests per site. Respect each site's terms, and the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) if you rely on the OSM fallback.
- Avoid scraping Google Maps HTML directly. It breaks Google's Terms of Service; the official Places API is used instead.
