import { analyzePainPoints, type PainPoint } from "../painPoints";
import type { GeneratedMessage, Lead, SenderProfile } from "../types";
import { BANNED_WORDS, SYSTEM_PROMPT, buildUserPrompt } from "./prompt";
import { findViolations, sanitizeSubject, sanitizeText, type SanitizeOptions } from "./sanitize";

interface Draft {
  subject: string;
  body: string;
}

function parseDraft(raw: string): Draft {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const obj = JSON.parse(cleaned.slice(start, end + 1)) as Partial<Draft>;
  if (!obj.subject || !obj.body) throw new Error("LLM returned JSON without subject/body");
  return { subject: String(obj.subject), body: String(obj.body).replace(/\\n/g, "\n") };
}

/** Groq: OpenAI-compatible endpoint, generous free tier. https://console.groq.com */
async function callGroq(system: string, user: string, temperature = 0.7): Promise<Draft> {
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature,
      max_completion_tokens: 1500,
      response_format: { type: "json_object" },
      // gpt-oss models reason before answering; keep it short so the budget goes to the email.
      ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low", include_reasoning: false } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return parseDraft(data.choices[0].message.content);
}

/** Google Gemini: free tier via Google AI Studio. https://aistudio.google.com/apikey */
async function callGemini(system: string, user: string, temperature = 0.7): Promise<Draft> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY || "" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        // 2.5 models "think" by default; a short email does not need it and it eats the token budget.
        ...(model.includes("2.5-flash") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  return parseDraft(text);
}

/** Zero-dependency fallback so the app still works with no LLM key. Follows the same rules. */
export function templateDraft(lead: Lead, pains: PainPoint[], sender: SenderProfile, niche: string, city: string): Draft {
  const name = lead.businessName;
  const where = city.split(",")[0].trim() || "your area";
  const service = (niche || lead.meta.category || "home services").toLowerCase();
  const me = sender.name?.split(" ")[0] || "Alex";
  const agency = sender.agency || "a local marketing studio";
  const main = pains[0]?.key;
  const secondary = pains[1];
  let subject = "quick question";
  let p1 = "";
  let p2 = "";
  switch (main) {
    case "website":
      subject = `website for ${name}`.toLowerCase();
      p1 = `I was looking for a ${service} company in ${where} and found ${name} on Google. I couldn't find a website for you though.`;
      p2 = `When people search for ${service} near them, most call the first company with a real site. A simple one with a call button and a quote form turns those searches into jobs.`;
      break;
    case "website_down":
      subject = "your website isn't loading";
      p1 = `I tried to visit the ${name} website today and it wouldn't load for me.`;
      p2 = `Anyone in ${where} who clicks it right now probably just calls the next company. I can get it back up, or build a faster one if it needs it.`;
      break;
    case "gmb_missing":
      subject = `${name} on google maps`.toLowerCase();
      p1 = `I searched for ${service} in ${where} and ${name} didn't show up in the Google map results.`;
      p2 = `That map section is where most local calls come from. Setting up and optimizing your Google Business Profile is usually the fastest way to get more calls.`;
      break;
    case "gmb_poor":
      subject = "your google reviews";
      p1 = `I came across ${name} on Google while looking at ${service} companies in ${where}.`;
      p2 = `Right now competitors with more reviews show up ahead of you in the map results. A simple review system plus a cleaned up profile can move you up and bring in more calls.`;
      break;
    case "social":
      subject = `${name} on facebook`.toLowerCase();
      p1 = `I was checking out ${service} companies in ${where} and couldn't find ${name} on Facebook or Instagram.`;
      p2 = `A lot of homeowners look you up there before they call. Posting real job photos a few times a week builds trust and brings in referrals.`;
      break;
    default:
      subject = "quick idea for more calls";
      p1 = `I came across ${name} while looking at ${service} companies in ${where}.`;
      p2 = `I put together quick audits showing how local companies compare on Google. Happy to send yours over, it takes 5 minutes to read.`;
  }
  const extra = secondary ? ` I also noticed ${secondary.label.toLowerCase().replace(/ \(.*\)/, "")}, which we can help with too.` : "";
  const proof = sender.proof ? `\n\nFor context, we ${sender.proof.replace(/^we /i, "")}.` : "";
  const cta = main === "website" ? "Want me to send over a quick mockup?" : "Worth a 10 minute call this week?";
  const body = `Hi there,\n\n${p1}\n\n${p2}${extra}${proof}\n\n${cta}\n\n${me}\n${agency}`;
  return { subject, body };
}

export function activeProvider(): GeneratedMessage["provider"] {
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return "template";
}

export async function generateMessage(
  lead: Lead,
  sender: SenderProfile,
  niche: string,
  city: string,
): Promise<GeneratedMessage> {
  const pains = analyzePainPoints(lead);
  const opts: SanitizeOptions = { allow: /landscap|lawn|garden/i.test(niche) ? ["landscape", "landscapes"] : [] };
  const user = buildUserPrompt(lead, pains, sender, niche, city);
  let provider = activeProvider();
  let draft: Draft;

  try {
    if (provider === "groq") draft = await callGroq(SYSTEM_PROMPT, user);
    else if (provider === "gemini") draft = await callGemini(SYSTEM_PROMPT, user);
    else draft = templateDraft(lead, pains, sender, niche, city);
  } catch (err) {
    // Try the other provider, then the template, so one bad key never blocks outreach.
    console.error("[generate] primary provider failed:", err);
    try {
      if (provider === "groq" && process.env.GEMINI_API_KEY) {
        draft = await callGemini(SYSTEM_PROMPT, user);
        provider = "gemini";
      } else throw err;
    } catch {
      draft = templateDraft(lead, pains, sender, niche, city);
      provider = "template";
    }
  }

  let subject = sanitizeSubject(draft.subject, opts);
  let body = sanitizeText(draft.body, opts);
  // Final guard: if anything slipped past the sanitizer, fall back to the template.
  if (findViolations(subject + "\n" + body, BANNED_WORDS, opts.allow).length) {
    const t = templateDraft(lead, pains, sender, niche, city);
    subject = sanitizeSubject(t.subject, opts);
    body = sanitizeText(t.body, opts);
    provider = "template";
  }
  return { subject, body, painPoints: pains.map((p) => p.label), provider, generatedAt: new Date().toISOString() };
}
