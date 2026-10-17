import axios from "axios";
import config from "../config/index.js";

const { ai, company } = config;

/**
 * AI provider service — talks to a configurable HTTP chat endpoint
 * (AI_API_BASE_URL). This file was originally built against a specific
 * provider's /v1/chat API; the request/response shape in callAiProvider()
 * below is what that provider expected — if you're using a different
 * provider (OpenAI, Anthropic, a custom backend, etc.), adapt the request
 * body and the response-parsing lines marked below to match its API.
 *
 * Everything else in this file — the system prompt builder, history
 * trimming, and especially the WhatsApp-formatting defensive fixes in
 * parseAIResponse() — is provider-agnostic and worth keeping as-is
 * regardless of which AI backend you end up using.
 */

// Many providers cap the system prompt length. A "research/evidence" field
// on a real claim can run to many paragraphs — with several candidate
// claims embedded, the full prompt can exceed that limit. Cap each claim's
// longest field so multiple claims always stay well under the limit,
// regardless of how long any one claim's writeup is. Adjust CLAIM_* caps
// and the hard backstop below to match your provider's actual system
// prompt limit (8000 chars is a reasonable default to start from).
const CLAIM_SUMMARY_CAP = 400;
const CLAIM_RESEARCH_CAP = 900;
const SYSTEM_PROMPT_HARD_CAP = 7800;

function truncate(text, max) {
  const s = String(text || "");
  return s.length > max ? `${s.slice(0, max).trim()}… (see full report link for the rest)` : s;
}

/**
 * Trim conversation history for the AI call. A fixed turn *count* is the
 * wrong cap — request time scales with total payload size, and turns vary
 * wildly in length (a "hi" vs. a long assistant answer). A user with a long
 * running conversation can hit the turn-count cap while still sending
 * several thousand characters of history, which can measurably slow down
 * response time. Cap both turn count AND total character budget, keeping
 * the most recent turns first and dropping older ones (by either measure)
 * until the request stays a size that responds quickly and reliably
 * regardless of how long the conversation has run.
 */
function trimHistory(history, maxTurns, maxChars) {
  const recent = history.slice(-maxTurns);
  const kept = [];
  let total = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const len = (recent[i].content || "").length;
    if (total + len > maxChars && kept.length > 0) break; // always keep at least the most recent turn
    total += len;
    kept.unshift(recent[i]);
  }
  return kept;
}

/**
 * Build the system prompt that turns the AI provider into this business's
 * WhatsApp assistant. Everything business-specific is pulled from
 * config.company (set via env vars — see .env.example) so this file itself
 * stays generic. The "HOW TO RESPOND" rules below are written for a
 * claims/fact-check style assistant as a working example — adapt them to
 * whatever domain this instance is actually being built for (support,
 * sales, bookings, etc.), keeping the WhatsApp FORMAT rules (11-12) as-is
 * since those are hard-won fixes for how WhatsApp renders text, not
 * specific to any one business domain.
 *
 * @param {object|null} member - { name } if this is a known/registered member, else null (guest)
 * @param {Array} matchedClaims - records from your knowledge base that matched the user's message (may be empty)
 */
function buildSystemPrompt(member, matchedClaims = []) {
  const claimsBlock = matchedClaims.length > 0
    ? matchedClaims.map((c) => {
        const v = c.verdict;
        const checker = v?.factChecker ? `${v.factChecker.name}${v.factChecker.organization ? ` (${v.factChecker.organization})` : ""}` : "Not specified";
        return (
          `- Claim: ${c.title}\n` +
          `  Circulating via: ${c.source || "unknown"} | Topics: ${(c.topics || []).join(", ") || "—"}\n` +
          `  Verdict: ${v?.verdict || "Unverified"}\n` +
          `  Verdict summary: ${truncate(v?.summary, CLAIM_SUMMARY_CAP) || "Not specified"}\n` +
          `  Research/evidence: ${truncate(v?.research, CLAIM_RESEARCH_CAP) || "Not specified"}\n` +
          `  Fact-checked by: ${checker}\n` +
          `  Published: ${c.publishedAt ? new Date(c.publishedAt).toDateString() : "Unknown"}\n` +
          `  Full report: ${c.url || company.website}`
        );
      }).join("\n\n")
    : "(No matching record was found in the knowledge base for this message.)";

  const prompt = `You are ${company.name}'s assistant on WhatsApp, in the ${company.industry} space. Your tone is ${company.tone}. If asked what model or technology powers you, say you're ${company.name}'s own assistant — do not name any underlying AI provider.

${member?.name ? `You are talking to ${member.name}, a registered member. Address them by name naturally and warmly.` : `You are talking to a guest who has not registered an account yet.`}

ABOUT ${company.name.toUpperCase()}:
${company.description}
Website: ${company.website}

CANDIDATE RECORDS FROM THE KNOWLEDGE BASE (found by automated keyword search — may include false positives):
${claimsBlock}

HOW TO RESPOND (example rules for a claims/fact-check style assistant — rewrite 1-10 for your actual domain; keep 11-12 as-is, they're WhatsApp formatting fixes, not domain-specific):
1. First, judge for yourself whether any candidate record above is ACTUALLY about the same subject as the user's message — the search above is keyword-based and can surface unrelated records that just happen to share a common word. Never treat a record as a match just because it's listed.
2. If a candidate IS genuinely the same claim/story, lead with it: state the verdict clearly, give the key evidence, credit the source if given, and share the full report link. Do not invent details beyond what's given.
2b. If a candidate is about the same entity/topic but a NARROWER or DIFFERENT specific claim than what was actually asked, do NOT lead with "*Verdict:*" framing as if it answers the question — that reads as a direct answer even with a caveat attached below it. Instead, name it as related-but-different context, then still synthesize careful background for the actual question asked, same as rule 3.
3. If none of the candidates are truly about the user's claim (or none were found), do NOT mention the unrelated ones and do NOT pretend a match exists. Instead, synthesize careful, neutral background information using your own knowledge (and live web search where useful). Clearly say this hasn't been verified/published yet.
4. Always highlight common red flags of misleading content when relevant: missing or unnamed sources, urgent/emotional language, requests to "share before it's deleted", manipulated or out-of-context images, screenshots without dates, impersonation of officials/brands.
5. For proverbs, idioms, or slang, explain the literal meaning AND the cultural point being made.
6. Never be alarmist or tell the user what to believe politically — present evidence and context, and let them judge.
7. Keep replies concise and scannable on WhatsApp: short paragraphs, *bold* for verdicts/key terms, occasional relevant emoji (not excessive).
8. If the user's message isn't on-topic at all (e.g. small talk, "how are you"), respond warmly and briefly, then gently steer back: ask what they'd like help with.
9. If the user explicitly asks to speak to a human, or reports something urgent, emit [ESCALATE] immediately.
10. CRITICAL: if the user asks a real, specific question, you MUST attempt an actual answer using the candidate records, your own knowledge, and web search — never deflect a specific question with a generic "here's what I can help with" capabilities menu. A menu-style non-answer is only appropriate for a message with genuinely no content to act on (e.g. a bare "hi").
11. FORMAT: Under 200 words per reply. WhatsApp markdown only: single asterisks for *bold* and single underscores for _italic_. NEVER use double asterisks (**bold**) — that's standard markdown, not WhatsApp's syntax, and shows up as literal asterisks on the user's phone instead of bold text. No markdown tables or headers. Always put a blank line (an empty line, i.e. two line breaks) between distinct parts of the reply: between the opening sentence and the next section, before and after each *bold section header*, between a paragraph and a bullet list, and before the closing line. Never run the intro, a labeled section, and the closing line together with only single line breaks — WhatsApp needs that visual spacing to stay readable. EVERY bullet point is its own line — never write two or more points on the same line separated by dashes (e.g. "- Point one. - Point two." is WRONG; each "-" starts a new line).
12. Never open a reply with a filler/throat-clearing preamble that delays the actual answer (e.g. "Let me check on this", "Let me look into that for you", "Give me a moment"). You already have (or don't have) the answer, so start the reply with it: the verdict, the context, or the answer itself, in the first sentence.

FORMAT EXAMPLE — match this exact shape whenever a reply has more than one point (blank lines shown as empty lines between sections; every bullet on its own line):

Yes, this is a real but narrow risk — it only happens in specific situations. 🌱

*How it happens:*
- Point one explained in a short, standalone clause
- Point two explained the same way
- Point three, same pattern

*How to stay safe:*
- Actionable tip one
- Actionable tip two

*Bottom line:* A short closing sentence that wraps it up. 🙏

TAGS: [ESCALATE]short reason[/ESCALATE] is the ONLY tag that exists, and only when the user explicitly wants a human or the situation needs urgent human review — append it at the very end, on its own line. Do NOT invent any other bracketed tags, labels, or metadata lines — your entire response other than [ESCALATE] must be plain conversational WhatsApp text a real person reads.`;

  // Defensive backstop: even with the per-field caps above, guard against the
  // prompt ever exceeding the provider's system-prompt limit for any other
  // reason (e.g. the fixed template itself grows over time).
  return prompt.length > SYSTEM_PROMPT_HARD_CAP
    ? `${prompt.slice(0, SYSTEM_PROMPT_HARD_CAP)}\n[...truncated to stay under the system prompt limit]`
    : prompt;
}

// Some providers' "reply in the language the user wrote in" auto-detection
// can get pulled toward whatever language dominates the conversation
// HISTORY instead of the current message. If your provider does this, this
// is a worked example of one mitigation: when the current message is
// confidently plain English (no markers of the other languages you support),
// override the provider's auto-detect with an explicit "english" hint so
// history can't bias it. Replace NON_ENGLISH_MARKER with whatever markers
// are relevant to the languages you actually support, or remove this
// override entirely if your provider doesn't have this problem.
const NON_ENGLISH_MARKER = /[à-ɏ]/i; // placeholder: adjust to markers for your supported languages
const ENGLISH_WORD_PATTERN = /\b(the|is|are|can|does|what|why|how|who|when|will|would|should|please|thanks|could|and)\b/i;

function isConfidentlyEnglish(text) {
  const s = String(text || "");
  if (NON_ENGLISH_MARKER.test(s)) return false;
  return /^[\x00-\x7F]*$/.test(s) && ENGLISH_WORD_PATTERN.test(s);
}

/**
 * Generate a reply via the configured AI provider.
 * @param {Array<{role:string, content:string}>} conversationHistory - full history, last item is the current user message
 * @param {object|null} member - known member profile, or null for guest
 * @param {Array} matchedClaims - records matched from your knowledge base for the current message
 */
export async function generateResponse(conversationHistory, member = null, matchedClaims = []) {
  const history = trimHistory(conversationHistory.slice(0, -1), ai.historyTurns, ai.historyMaxChars);
  const lastMsg = conversationHistory[conversationHistory.length - 1];
  const message = lastMsg?.content || "";
  const system = buildSystemPrompt(member, matchedClaims);
  const historyPayload = history.map((m) => ({ role: m.role, content: m.content }));
  const responseLanguage = isConfidentlyEnglish(message) ? "english" : ai.responseLanguage;

  try {
    return await callAiProvider(message, system, historyPayload, responseLanguage);
  } catch (err) {
    const code = err.response?.data?.code;
    console.error("AI provider error:", code || err.message, err.response?.data?.detail || "");

    // Example of adapting to a provider-specific quirk: some providers can
    // fail outright on a translation/language-detection step for short or
    // casual text instead of just defaulting. Retry once forcing English
    // rather than dead-ending. Remove this block if it doesn't apply to
    // your provider.
    if (code === "translation_failed") {
      try {
        return await callAiProvider(message, system, historyPayload, "english");
      } catch (retryErr) {
        console.error("AI provider retry (forced English) also failed:", retryErr.response?.data?.code || retryErr.message);
        return {
          text: "Sorry, I had trouble understanding that. Could you try rephrasing? 🙏",
          escalate: null,
          sources: [],
        };
      }
    }

    return {
      text: `I'm having a brief technical issue right now. Please try again shortly, or contact us at ${company.phone}. 📞`,
      escalate: null,
      sources: [],
    };
  }
}

// --- Adapt this function to your actual AI provider's API shape ---
async function callAiProvider(message, system, historyPayload, responseLanguage) {
  const t0 = Date.now();
  const response = await axios.post(
    `${ai.baseUrl}/v1/chat`,
    {
      message,
      system,
      history: historyPayload,
      temperature: ai.temperature,
      max_tokens: ai.maxTokens,
      response_language: responseLanguage,
      web_search: ai.webSearch,
    },
    {
      headers: {
        "Content-Type": "application/json",
        ...(ai.apiKey ? { Authorization: `Bearer ${ai.apiKey}` } : {}),
      },
      // Some questions are inherently slower than others (e.g. ones that
      // trigger a live web search on the provider's side), sometimes by a
      // wide margin. Since the webhook already ACKs the incoming message
      // before this call even starts (see webhook.js — handleIncomingMessage
      // runs fire-and-forget), nothing user-facing is blocked by waiting
      // longer here. A genuinely completing answer is always better than a
      // fallback message, so this is intentionally generous — tune it down
      // if your provider is consistently fast.
      timeout: 300000,
    }
  );
  console.log(`[Perf] AI provider (${responseLanguage}): ${Date.now() - t0}ms`);

  // Adjust these two lines to match your provider's actual response shape.
  const raw = response.data?.data?.message || response.data?.reply || "I'm sorry, I couldn't process that. Please try again.";
  const sources = response.data?.data?.sources || response.data?.sources || [];
  return { ...parseAIResponse(raw), sources };
}

/**
 * Parse structured tags out of the AI response, and clean up formatting
 * issues for WhatsApp. Everything in this function is provider-agnostic —
 * these are fixes for how LLMs tend to format text vs. what WhatsApp
 * actually renders, found through real production use. Worth keeping
 * regardless of which AI provider you use.
 */
function parseAIResponse(raw) {
  let text = raw;
  let escalate = null;

  // Some providers can echo sources a second time as a literal
  // <sources>...</sources> block inline in the reply text, duplicating a
  // separate structured `sources` array returned alongside it. Strip it —
  // otherwise it leaks into the WhatsApp message as raw, unreadable markup.
  text = text.replace(/<sources>[\s\S]*?<\/sources>/gi, "").trim();

  // Defensive: LLMs occasionally glitch into a repeated-word loop near the
  // end of a response (the model gets stuck repeating the same token and is
  // cut off mid-word). Detect 3+ consecutive repeats of the same word and
  // cut the reply there — but only if that still leaves a substantive
  // reply; if the glitch starts too early, a full garbled message beats an
  // empty one.
  const repMatch = text.match(/\b(\S{2,})(\s+\1){2,}/i);
  if (repMatch && repMatch.index > 40) {
    text = text.slice(0, repMatch.index).trim();
  }

  const escMatch = text.match(/\[ESCALATE\](.*?)\[\/ESCALATE\]/s);
  if (escMatch) {
    escalate = escMatch[1].trim();
    text = text.replace(escMatch[0], "").trim();
  }

  // Defensive net: strip any other hallucinated trailing bracketed tag-line
  // the model invents despite instructions (e.g. "[CLAIM: ... | STATUS: ...]").
  // Real WhatsApp replies never legitimately end in a bare [..] line, so this
  // is safe — only touches the last line, and only if it's fully bracketed.
  const lines = text.split("\n");
  while (lines.length > 0 && /^\[.+\]$/.test(lines[lines.length - 1].trim())) {
    lines.pop();
  }
  text = lines.join("\n").trim();

  // Defensive net: LLMs don't always follow the "*bold* only" instruction
  // and sometimes write standard-markdown **bold** instead. WhatsApp has no
  // double-asterisk syntax — on a real phone that shows as literal asterisks
  // around the text, not bold — and it also silently defeats the header
  // detection below (which only recognises single-asterisk headers). Convert
  // before anything else touches formatting.
  text = text.replace(/\*\*([^*\n]+)\*\*/g, "*$1*");

  // Defensive net: an LLM can return a reply as essentially ONE giant line
  // with no real line breaks at all — headers and bullet points glued
  // together with nothing but inline "- " separators. A line-by-line
  // splitter can't fix that because there's only one line to begin with, so
  // restructure the whole text instead: force every bold *Header:* to start
  // a fresh paragraph wherever it appears, then — only when the text
  // actually looks like a list — break each "- " marker onto its own line.
  text = text.replace(/\s*(\*[^*\n]{1,60}:\*)/g, "\n\n$1");
  if (isDashDelimitedList(text)) {
    text = text.replace(/\s-\s+(?=\S)/g, "\n- ");
  }
  text = text
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();

  // Defensive net: LLMs don't always follow the blank-line spacing rule in
  // the system prompt, making longer replies read as one compacted block on
  // WhatsApp — a bold *Section header* or a bullet list glued directly onto
  // the line before it with no visual breathing room. Rebuild spacing
  // structurally rather than relying on the model alone: ensure a blank
  // line separates a paragraph from a bold header and a paragraph from a
  // bullet list (in both directions), without doubling blank lines that are
  // already there. Deliberately scoped to these two clear cases only — the
  // model can't be reliably told apart on plain sentence-to-sentence breaks.
  text = normalizeParagraphSpacing(text);

  return { text, escalate };
}

// Distinguishes a real dash-delimited list ("- Point one - Point two -
// Point three") from a genuine em-dash aside ("the risk - though rare - is
// real"). A real list item is a fresh, standalone clause and so almost
// always starts with a capital letter (or a digit/emoji); an aside's
// enclosed and trailing clauses continue the surrounding sentence in
// lowercase. Requires 3+ segments (2+ dash separators) so a single aside
// dash pair is never enough on its own.
function isDashDelimitedList(text) {
  const segments = text.split(/\s-\s+(?=\S)/);
  if (segments.length < 3) return false;
  const rest = segments.slice(1);
  const startsNewPoint = (s) => /^[A-Z0-9\u{1F300}-\u{1FAFF}☀-➿⬀-⯿]/u.test(s.trim());
  return rest.every(startsNewPoint);
}

function normalizeParagraphSpacing(text) {
  const rawLines = text.split("\n");
  const isBullet = (l) => /^\s*[-•]\s/.test(l);
  const isBoldHeader = (l) => /^\*[^*\n]+:?\*\s*$/.test(l.trim());
  const out = [];
  for (const line of rawLines) {
    const trimmed = line.trim();
    const prev = out.length > 0 ? out[out.length - 1] : null;
    const prevTrimmed = prev !== null ? prev.trim() : null;
    const needsBlankBefore =
      trimmed !== "" &&
      prevTrimmed !== null &&
      prevTrimmed !== "" &&
      ((isBoldHeader(line) && !isBoldHeader(prev)) ||
        (isBullet(line) && !isBullet(prev) && !isBoldHeader(prev)) ||
        (!isBullet(line) && !isBoldHeader(line) && isBullet(prev)));
    if (needsBlankBefore) out.push("");
    out.push(line);
  }
  // Collapse 3+ consecutive blank lines down to 1 — WhatsApp only needs one.
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
