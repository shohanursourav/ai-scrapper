/**
 * Deterministic post-processing so the "no AI fluff" rules hold even if the LLM slips.
 */
const REPLACEMENTS: [RegExp, string][] = [
  [/\bi hope (this|the|my) (email|message|note)? ?finds you well[.,!]?\s*/gi, ""],
  [/\bi hope you('| a)re (doing )?well[.,!]?\s*/gi, ""],
  [/\blook no further[.,!]?\s*/gi, ""],
  [/\bin today's [a-z\s-]*?(world|age|market|era|economy)[,.]?\s*/gi, ""],
  [/\btake your business to the next level\b/gi, "get more jobs"],
  [/\b(digital|online) presence\b/gi, "how you show up online"],
  [/\bboost your\b/gi, "grow your"],
  [/\bgame[- ]changer\b/gi, "big win"],
  [/\bcutting[- ]edge\b/gi, "modern"],
  [/\bdelv(e|es|ed|ing)\b/gi, "dig"],
  [/\brobust\b/gi, "solid"],
  [/\blandscapes?\b/gi, "market"],
  [/\btailored\b/gi, "custom"],
  [/\btailor(s|ing)?\b/gi, "set up"],
  [/\brevolutioniz(e|es|ed|ing)\b/gi, "change"],
  [/\bunlock(s|ed|ing)?\b/gi, "get"],
  [/\bleverag(e|es|ed|ing)\b/gi, "use"],
  [/\belevat(e|es|ed|ing)\b/gi, "improve"],
  [/\bseamlessly\b/gi, "smoothly"],
  [/\bseamless\b/gi, "smooth"],
  [/\bempower(s|ed|ing)?\b/gi, "help"],
  [/\bsynerg(y|ies)\b/gi, "fit"],
  [/\bharness(es|ed|ing)?\b/gi, "use"],
  [/\bnavigat(e|es|ed|ing)\b/gi, "handle"],
  [/\brealm\b/gi, "area"],
  [/\b(furthermore|moreover)\b,?/gi, "also"],
  [/\butiliz(e|es|ed|ing)\b/gi, "use"],
  [/\bstreamlin(e|es|ed|ing)\b/gi, "simplify"],
  [/\bsupercharg(e|es|ed|ing)\b/gi, "improve"],
  [/\bskyrocket(s|ed|ing)?\b/gi, "grow"],
  [/\btestament\b/gi, "proof"],
];

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{FE0F}]/gu;

function matchCase(src: string, repl: string) {
  if (!repl) return repl;
  return src[0] === src[0].toUpperCase() && src[0] !== src[0].toLowerCase() ? repl[0].toUpperCase() + repl.slice(1) : repl;
}

export interface SanitizeOptions {
  /** Words allowed for this lead, e.g. "landscape" for a landscaping company. */
  allow?: string[];
}

export function sanitizeText(input: string, opts: SanitizeOptions = {}): string {
  let t = input.replace(/\r\n/g, "\n");
  // Dashes: em/en dash and spaced hyphen used as a dash become commas.
  t = t.replace(/\s*[\u2014\u2015]\s*/g, ", ").replace(/\s+\u2013\s+/g, ", ").replace(/\u2013/g, "-").replace(/ +- +/g, ", ");
  t = t.replace(/\s*--\s*/g, ", ");
  for (const [re, repl] of REPLACEMENTS) {
    if (opts.allow?.some((w) => new RegExp(re.source, "i").test(w))) continue;
    t = t.replace(re, (m) => matchCase(m, repl));
  }
  t = t.replace(EMOJI_RE, "");
  t = t.replace(/!+/g, ".");
  // Smart quotes to plain, tidy punctuation spacing.
  t = t.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\u2026/g, "...");
  t = t.replace(/,\s*,/g, ",").replace(/ +,/g, ",").replace(/,\s*\./g, ".").replace(/\.\s*\./g, ".").replace(/,[ \t]*\n/g, ",\n");
  t = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ");
  // Capitalize after sentence breaks that may have been created.
  t = t.replace(/(^|[.?]\s+|\n)([a-z])/g, (_, p, c) => p + c.toUpperCase());
  return t.trim();
}

export function sanitizeSubject(s: string, opts: SanitizeOptions = {}): string {
  return sanitizeText(s, opts).replace(/[:\n]/g, " ").replace(/\.$/, "").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Returns any rule violations left in the text (used by tests and as a safety check). */
export function findViolations(text: string, banned: string[], allow: string[] = []): string[] {
  const v: string[] = [];
  if (/[\u2014\u2013]/.test(text)) v.push("dash");
  for (const w of banned) {
    if (allow.some((a) => a.toLowerCase().includes(w))) continue;
    if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) v.push(w);
  }
  return v;
}
