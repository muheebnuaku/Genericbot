import axios from "axios";
import config from "../config/index.js";

/**
 * Client for your knowledge-base / claims API — a read-only, partner-key
 * authenticated source of truth (e.g. a fact-check archive, a help-center
 * index). Point CLAIMS_API_BASE_URL / CLAIMS_API_KEY at your own service
 * and adjust normalizeClaim() below to match its response shape.
 *
 * This is the single source of truth for claim data — the bot does NOT
 * keep a local copy. Whatever your knowledge base publishes is what the
 * WhatsApp bot searches, live, on every request.
 */

const VERDICT_LABELS = {
  verdict_true: "True",
  verdict_false: "False",
  misleading: "Misleading",
  partly_true: "Partly True",
  unverifiable: "Unverifiable",
};

function client() {
  return axios.create({
    baseURL: config.claims.apiBaseUrl,
    headers: {
      Authorization: `Bearer ${config.claims.apiKey}`,
      Accept: "application/json",
    },
    timeout: 10000,
  });
}

/**
 * Full-text search published claims — this is what the message handler
 * calls on every incoming WhatsApp message to ground the AI's reply.
 *
 * IMPORTANT: many phrase-search APIs match an exact, contiguous phrase in
 * the title/content — not a keyword/AND search. E.g. a query like "goldbod
 * losses" matches an article whose title contains that exact phrase, but a
 * query like "wontumi bail" would NOT match an article about someone's bail
 * status if those two words aren't adjacent in the text. A natural WhatsApp
 * question almost never phrases itself as a verbatim title fragment, so
 * searching with the user's raw message directly can miss real matches
 * constantly. Adjust/remove this if your API supports real keyword/AND
 * search instead.
 *
 * Fix: try the raw message first (cheap, occasionally matches verbatim),
 * then fall back to querying each significant keyword individually
 * (proper nouns/names first) and merging results — since single words
 * always match as a one-word "phrase".
 */
export async function searchClaims(query, { limit = 3 } = {}) {
  if (!config.claims.apiKey) {
    console.warn("[ClaimsAPI] CLAIMS_API_KEY not set — claim search disabled, bot will answer from general knowledge only");
    return [];
  }
  if (!query || !query.trim()) return [];

  const direct = await runSearch(query, limit);
  if (direct.length > 0) return direct;

  const keywords = extractKeywords(query, 4);
  const merged = [];
  const seenIds = new Set();
  for (const kw of keywords) {
    if (merged.length >= limit) break;
    const results = await runSearch(kw, limit);
    for (const c of results) {
      if (merged.length >= limit) break;
      if (!seenIds.has(c.id)) {
        seenIds.add(c.id);
        merged.push(c);
      }
    }
  }
  return merged;
}

async function runSearch(q, limit) {
  try {
    const res = await client().get("/claims", {
      params: { q, per_page: Math.min(limit, 100) },
    });
    return (res.data?.data || []).map(normalizeClaim);
  } catch (err) {
    logError("search", err);
    return [];
  }
}

// Common filler words stripped before falling back to keyword search —
// covers question framing ("is it true that…"), not real claim content.
const STOPWORDS = new Set([
  "a", "an", "the", "is", "it", "its", "was", "were", "be", "been", "being", "am", "are",
  "i", "you", "he", "she", "we", "they", "him", "her", "them", "us", "my", "your", "his",
  "their", "our", "this", "that", "these", "those", "and", "or", "but", "if", "so",
  "of", "to", "in", "on", "at", "by", "for", "with", "about", "against", "between",
  "into", "through", "during", "before", "after", "above", "below", "from", "up",
  "down", "out", "off", "over", "under", "again", "further", "then", "once", "here",
  "there", "when", "where", "why", "how", "all", "any", "both", "each", "few", "more",
  "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "than",
  "too", "very", "can", "will", "just", "don", "should", "now", "did", "does", "do",
  "got", "get", "heard", "true", "false", "real", "fake", "happen", "happened",
  "know", "tell", "please", "kindly", "pls", "hi", "hello", "guy", "person", "someone",
]);

function extractKeywords(text, max = 4) {
  const words = (text || "")
    .replace(/[?!.,;:'"()]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const seen = new Set();
  const candidates = [];
  for (const w of words) {
    const lower = w.toLowerCase();
    if (w.length < 3 || STOPWORDS.has(lower) || seen.has(lower)) continue;
    seen.add(lower);
    candidates.push(w);
  }

  // Prioritize likely proper nouns (capitalized mid-sentence) — names are
  // the most distinctive single-word search term in this API's phrase-match model.
  candidates.sort((a, b) => {
    const aCap = /^[A-Z]/.test(a) ? 1 : 0;
    const bCap = /^[A-Z]/.test(b) ? 1 : 0;
    if (aCap !== bCap) return bCap - aCap;
    return b.length - a.length;
  });

  return candidates.slice(0, max);
}

/**
 * Fetch a single published claim by ID (e.g. for a dashboard detail view).
 */
export async function getClaimById(id) {
  if (!config.claims.apiKey) return null;
  try {
    const res = await client().get(`/claims/${id}`);
    return res.data?.data ? normalizeClaim(res.data.data) : null;
  } catch (err) {
    logError("getClaimById", err);
    return null;
  }
}

/**
 * List recent published claims with optional filters — used by the admin
 * dashboard's read-only Claims page (browsing, not managing — claims are
 * authored in your own knowledge-base system, not this dashboard).
 */
export async function listClaims({ q, topic, region, verdict, page = 1, perPage = 25 } = {}) {
  if (!config.claims.apiKey) return { claims: [], meta: null, disabled: true };
  try {
    const res = await client().get("/claims", {
      params: {
        q: q || undefined,
        topic: topic || undefined,
        region: region || undefined,
        verdict: verdict || undefined,
        page,
        per_page: Math.min(perPage, 100),
      },
    });
    return {
      claims: (res.data?.data || []).map(normalizeClaim),
      meta: res.data?.meta || null,
      disabled: false,
    };
  } catch (err) {
    logError("listClaims", err);
    return { claims: [], meta: null, disabled: false, error: err.response?.data?.error?.message || err.message };
  }
}

function normalizeClaim(c) {
  return {
    id: c.id,
    title: c.title,
    content: c.content,
    source: c.source,
    topics: c.topics || [],
    regions: c.regions || [],
    language: c.language,
    coverImageUrl: c.cover_image_url || null,
    publishedAt: c.published_at,
    updatedAt: c.updated_at,
    url: c.url,
    verdict: c.verdict
      ? {
          verdict: VERDICT_LABELS[c.verdict.verdict] || c.verdict.verdict,
          summary: c.verdict.summary,
          research: c.verdict.research,
          referenceLink: c.verdict.reference_link,
          checkedAt: c.verdict.checked_at,
          factChecker: c.verdict.fact_checker || null, // { name, organization }
        }
      : null,
  };
}

function logError(op, err) {
  const status = err.response?.status;
  const msg = err.response?.data?.error?.message || err.message;
  console.error(`[ClaimsAPI] ${op} failed${status ? ` (${status})` : ""}:`, msg);
}
