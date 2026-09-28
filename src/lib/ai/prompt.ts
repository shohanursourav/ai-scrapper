import type { PainPoint } from "../painPoints";
import { isFound, type Lead, type SenderProfile } from "../types";

/** Words the model must never use. Also enforced after generation by sanitize.ts. */
export const BANNED_WORDS = [
  "delve", "robust", "landscape", "tailor", "tailored", "revolutionize", "unlock", "leverage", "elevate",
  "seamless", "seamlessly", "game-changer", "game changer", "cutting-edge", "empower", "synergy", "harness",
  "navigate", "realm", "furthermore", "moreover", "utilize", "streamline", "supercharge", "skyrocket",
  "digital presence", "online presence", "in today's", "boost your", "take your business to the next level",
  "i hope this email finds you well", "i hope this finds you well", "look no further", "testament",
];

/**
 * SYSTEM PROMPT used for every outreach message (Groq and Gemini).
 * Kept in one place so it is easy to audit and tweak.
 */
export const SYSTEM_PROMPT = `You write cold outreach emails for a small local marketing agency. Your emails read like a real person typed them in two minutes. They get replies because they are short, specific and useful.

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
5. Never use these words or phrases: ${BANNED_WORDS.join(", ")}.
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
Use \\n for line breaks inside body. No markdown, no extra keys, no commentary.`;

/** Build the per-lead USER message. */
export function buildUserPrompt(lead: Lead, painPoints: PainPoint[], sender: SenderProfile, niche: string, city: string): string {
  const status = (v: string) => (isFound(v) ? v : "MISSING");
  const lines = [
    `BUSINESS DATA`,
    `Name: ${lead.businessName}`,
    `Niche: ${niche || lead.meta.category}`,
    `City: ${city || lead.meta.address}`,
    `Website: ${status(lead.website)}${lead.meta.websiteReachable === false ? " (did not load when we checked)" : ""}`,
    `Google Business Profile: ${isFound(lead.gmbLink) ? "found" : "MISSING"}${lead.meta.rating !== null ? `, ${lead.meta.rating} stars, ${lead.meta.reviewCount ?? 0} reviews` : ""}`,
    `Facebook: ${status(lead.facebook)}`,
    `Instagram: ${status(lead.instagram)}`,
    `TikTok: ${status(lead.tiktok)}`,
    `YouTube: ${status(lead.youtube)}`,
    ``,
    `PAIN POINTS (in priority order, pitch the first one)`,
    ...(painPoints.length
      ? painPoints.map((p, i) => `${i + 1}. ${p.label}: pitch ${p.pitch}`)
      : ["1. No major gaps found: offer a free 5 minute audit of how they show up on Google compared to local competitors"]),
    ``,
    `SENDER`,
    `Name: ${sender.name || "Alex"}`,
    `Agency: ${sender.agency || "a local marketing studio"}`,
    sender.proof ? `Proof line you may use once: ${sender.proof}` : `Proof line: none, do not invent one`,
    ``,
    `Write the email now. JSON only.`,
  ];
  return lines.join("\n");
}
