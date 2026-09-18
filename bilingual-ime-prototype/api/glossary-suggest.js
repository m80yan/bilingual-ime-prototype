import { domainGlossarySeedEntries, normalizeGlossaryPinyin } from "../src/data/domainGlossarySeed.js";

const allowedDomains = new Set([
  "design-uiux",
  "internet-slang",
  "history",
  "history-politics",
  "place",
  "auto",
  "ui",
  "movie",
  "device",
  "education",
  "business",
  "technology",
  "medical",
  "military",
  "marine",
  "general",
]);
const highPriorityFeedbackTags = new Set(["terminology_error", "tone_mismatch"]);

function json(response, body, status = 200) {
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json(body);
}

function readOutputText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  return data.output
    ?.flatMap((item) => item.content ?? [])
    .map((part) => part.text)
    .filter(Boolean)
    .join("");
}

function normalizeText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeSuggestion(item, index) {
  if (!item || typeof item !== "object") return null;
  const zh = normalizeText(item.zh, 24);
  const pinyin = normalizeGlossaryPinyin(normalizeText(item.pinyin, 80));
  const en = normalizeText(item.en, 80);
  const ja = normalizeText(item.ja, 80);
  const domain = allowedDomains.has(item.domain) ? item.domain : "general";
  const weight = Number.isFinite(item.weight) ? Math.max(50, Math.min(130, Math.round(item.weight))) : 80;
  const reason = normalizeText(item.reason, 120);
  const source = normalizeText(item.source, 80) || "auto-suggested";
  const feedbackTags = Array.isArray(item.feedbackTags)
    ? item.feedbackTags
        .map((tag) => normalizeText(tag, 32))
        .filter((tag) => highPriorityFeedbackTags.has(tag))
    : [];

  if (!zh || !pinyin || !en || !ja) return null;
  if (!/[\u3400-\u9fff]/.test(zh)) return null;
  const priorityBoost = feedbackTags.some((tag) => highPriorityFeedbackTags.has(tag)) ? 20 : 0;

  return {
    zh,
    pinyin,
    en,
    ja,
    domain,
    weight: Math.min(130, weight + priorityBoost),
    reason,
    source,
    feedbackTags,
    status: "pending",
    rank: index + 1,
  };
}

function uniqueSuggestions(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.zh}:${item.pinyin}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default async function handler(request, response) {
  if (request.method !== "POST") return json(response, { error: "Method not allowed" }, 405);

  const origin = request.headers.origin;
  if (origin && new URL(origin).host !== request.headers.host) return json(response, { error: "Invalid origin" }, 403);

  let body;
  try {
    body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
  } catch {
    return json(response, { error: "Invalid JSON" }, 400);
  }

  const texts = [...new Set(Array.isArray(body.texts) ? body.texts : [])]
    .map((text) => normalizeText(text, 240))
    .filter((text) => text && /[\u3400-\u9fff]/.test(text))
    .slice(0, 20);
  const hints = [...new Set(Array.isArray(body.hints) ? body.hints : [])]
    .map((hint) => normalizeText(hint, 32))
    .filter(Boolean)
    .slice(0, 20);
  const maxSuggestions = Math.max(1, Math.min(24, Number(body.limit) || 12));

  if (!texts.length && !hints.length) return json(response, { error: "No Chinese corpus or hints provided" }, 400);
  if (!process.env.OPENAI_API_KEY) return json(response, { error: "Glossary suggestion service is not configured" }, 503);

  const existingTerms = domainGlossarySeedEntries
    .map((entry) => entry.zh)
    .slice(0, 120);
  const prompt = [
    "You are helping maintain a web-based Chinese bilingual IME glossary for a Notion embed. Users do not have local IME resources.",
    "Extract high-value glossary entries from the provided Chinese corpus and hints.",
    "Prioritize reusable terms that improve candidate generation or translation: proper nouns, place names, institutions, product names, UI/UX terms, internet workplace slang, car/device/movie/history/education/business terms, idioms, and fixed expressions.",
    "Treat terminology errors and tone mismatches as high-priority feedback. If a term needs a standard professional translation, mark feedbackTags with terminology_error. If a phrase needs style/register control for Daily/Formal/Technical, mark feedbackTags with tone_mismatch.",
    "Use accepted professional terms instead of literal calques; for example, use U-boat rather than U-ship when the Chinese source refers to the historical/military term.",
    "Do not include generic single characters, ordinary function words, or full sentences unless the full phrase is a reusable fixed expression.",
    "Do not duplicate existing terms.",
    "Return only a JSON array. Each item must have: zh, pinyin, en, ja, domain, weight, reason, source, feedbackTags.",
    "Use lowercase pinyin with no tone marks and no spaces. Use domain from this list: design-uiux, internet-slang, history, history-politics, place, auto, ui, movie, device, education, business, technology, medical, military, marine, general.",
    "Use weight from 50 to 130. Higher means more important for candidate ranking.",
    `Return at most ${maxSuggestions} items.`,
    `Existing terms to avoid: ${JSON.stringify(existingTerms)}`,
    `Hints: ${JSON.stringify(hints)}`,
    `Corpus: ${JSON.stringify(texts)}`,
  ].join("\n");

  const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5-nano",
      reasoning: { effort: "minimal" },
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
      max_output_tokens: 900,
    }),
  });

  if (!openaiResponse.ok) {
    const detail = await openaiResponse.text();
    console.error("OpenAI glossary suggestion request failed", openaiResponse.status, detail);
    return json(response, { error: "Glossary suggestion service is unavailable" }, 502);
  }

  const data = await openaiResponse.json();
  const outputText = readOutputText(data);
  try {
    const raw = outputText.replace(/^```json\s*|\s*```$/g, "");
    const parsed = JSON.parse(raw);
    const suggestions = uniqueSuggestions((Array.isArray(parsed) ? parsed : [])
      .map(normalizeSuggestion)
      .filter(Boolean))
      .slice(0, maxSuggestions);
    return json(response, { suggestions });
  } catch {
    console.error("OpenAI glossary suggestion response could not be read", outputText);
    return json(response, { error: "Glossary suggestion response could not be read" }, 502);
  }
}
