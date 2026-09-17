import { getRelevantGlossary, phraseTranslations } from "./domain-glossary.js";

const supportedLanguages = {
  en: "natural English",
  ja: "natural Japanese",
};

function readOutputText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  return data.output
    ?.flatMap((item) => item.content ?? [])
    .map((part) => part.text)
    .filter(Boolean)
    .join("");
}

function json(response, body, status = 200) {
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json(body);
}

function normalizeTargetPunctuation(text, language) {
  if (language !== "en") return text;
  return text
    .replace(/，/g, ",")
    .replace(/。/g, ".")
    .replace(/！/g, "!")
    .replace(/？/g, "?")
    .replace(/；/g, ";")
    .replace(/：/g, ":")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/([,.!?;:])(?=\S)/g, "$1 ");
}

function removeRepeatedSentences(text) {
  const parts = text.match(/[^.!?。！？]+[.!?。！？]?/g) ?? [text];
  const seen = new Set();
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const key = part.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(" ");
}

function polishTranslation(text, language) {
  return removeRepeatedSentences(normalizeTargetPunctuation(text, language)).trim();
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

  const targetLanguage = body.targetLanguage;
  const mode = body.mode === "final" ? "final" : "draft";
  const context = typeof body.context === "string" ? body.context.slice(0, 600) : "";
  const texts = [...new Set(Array.isArray(body.texts) ? body.texts : [])]
    .filter((text) => typeof text === "string" && text.length > 0 && text.length <= 80)
    .slice(0, 5);

  if (!supportedLanguages[targetLanguage] || !texts.length) return json(response, { error: "Invalid translation request" }, 400);
  const glossary = phraseTranslations[targetLanguage] ?? {};
  const localResults = Object.fromEntries(texts
    .filter((text) => glossary[text])
    .map((text) => [text, glossary[text]]));
  const remoteTexts = texts.filter((text) => !localResults[text]);

  if (!remoteTexts.length) return json(response, { translations: localResults });
  if (!process.env.OPENAI_API_KEY) return json(response, { error: "Translation service is not configured" }, 503);

  const relevantGlossary = getRelevantGlossary(remoteTexts, targetLanguage);
  const prompt = [
    `Translate every Simplified Chinese item into ${supportedLanguages[targetLanguage]}.`,
    mode === "final"
      ? "These are completed sentences. Rewrite them as natural, context-aware output. Preserve the meaning and tone; do not translate word-for-word when a native phrase is better."
      : "Use concise, natural wording for a bilingual writing/IME demo. Do not translate word-for-word when a native phrase is better.",
    "Prefer everyday American English for English output. Keep professional UI/UX and product-design terms precise when the sentence is about design.",
    "Relevant domains include UI/UX design, product design, design systems, interaction design, visual design, cars, phones/devices, movies, history, daily life, and English learning.",
    "When translating to English, output English punctuation, avoid Chinese punctuation, preserve standard product spacing such as Mate 70 Pro, and do not repeat the same sentence.",
    mode === "final"
      ? "For completed English sentences, make the subject explicit when Chinese omits it, choose natural domain wording such as major in arts or business, use a decade later for 十年后 when natural, and keep rhetorical or emotional force."
      : "For candidate words or unfinished fragments, keep the output short and literal enough to help selection.",
    context ? `Use this surrounding Chinese context when it helps: ${context}` : "",
    `Use these matched glossary entries when relevant: ${JSON.stringify(relevantGlossary)}`,
    "Return only a JSON object whose keys are the original Chinese strings and values are their translations.",
    JSON.stringify(remoteTexts),
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
      max_output_tokens: 180,
    }),
  });

  if (!openaiResponse.ok) {
    const detail = await openaiResponse.text();
    console.error("OpenAI translation request failed", openaiResponse.status, detail);
    return json(response, { error: "Translation service is unavailable" }, 502);
  }

  const data = await openaiResponse.json();
  const outputText = readOutputText(data);
  try {
    const raw = outputText.replace(/^```json\s*|\s*```$/g, "");
    const result = JSON.parse(raw);
    const translations = Object.fromEntries(remoteTexts
      .filter((text) => typeof result[text] === "string")
      .map((text) => [text, polishTranslation(result[text], targetLanguage)]));
    return json(response, { translations: { ...localResults, ...translations } });
  } catch {
    console.error("OpenAI translation response could not be read", outputText);
    return json(response, { error: "Translation response could not be read" }, 502);
  }
}
