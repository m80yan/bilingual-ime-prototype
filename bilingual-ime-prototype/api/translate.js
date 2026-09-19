import { getRelevantGlossary, phraseTranslations } from "./domain-glossary.js";

const supportedLanguages = {
  en: "natural English",
  ja: "natural Japanese",
};
const translationStyleInstructions = {
  daily: "Style: daily. Use natural everyday wording, idiomatic phrasing, and conversational rhythm when appropriate. Prefer living expressions over stiff literal phrasing; for example, use idioms such as one-way ticket when they fit the meaning.",
  formal: "Style: formal. Use elevated written vocabulary and more complex sentence structures suitable for essays, reports, or official communication. Avoid basic conversational wording, slang, contractions, and casual phrasing; prefer words such as inevitably, commence, undertake, embark, substantial, and consequently when natural. Terminology must still be professionally correct.",
  technical: "Style: technical documentation. Use standard professional terminology, objective wording, concise structure, and unambiguous phrasing. Avoid literary flourish, rhetorical exaggeration, and ornamental vocabulary. Accuracy and precision outrank elegance.",
};
const terminologyPriorityInstruction = "Terminology accuracy has absolute priority over literal word-by-word translation. Before translating, identify domain-specific terms and use the accepted professional English term when one exists; never invent calques such as U-ship when the standard term is U-boat. This rule is mandatory for technical and formal styles and still preferred for daily style.";
const properNounCache = new Map();
const properNounCacheTtl = 24 * 60 * 60 * 1000;
const landmarkSuffixPattern = /(宫殿|大厅|广场|博物馆|美术馆|音乐厅|歌剧院|体育场|机场|车站|大学|学院|公园|花园|宫|厅|馆|院|寺|塔|桥|城|山|湖|河|岛|港|区|街|路)$/;
const commonProperNounFalsePositives = new Set(["工作", "用户", "产品", "设计", "界面", "体验", "输入", "输出", "中文", "英文", "日文", "翻译", "候选", "窗口", "文字", "内容", "句子", "词库", "模型", "大厅"]);
let wikidataQueue = Promise.resolve();
let lastWikidataRequestAt = 0;

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

function hasChinese(text) {
  return /[\u3400-\u9fff]/.test(text);
}

function uniqueList(items, limit) {
  return [...new Set(items.filter(Boolean))].slice(0, limit);
}

function escapeSparqlString(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function cachedProperNoun(term) {
  const cached = properNounCache.get(term);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    properNounCache.delete(term);
    return null;
  }
  return cached.value;
}

function cacheProperNoun(term, value) {
  properNounCache.set(term, { value, expiresAt: Date.now() + properNounCacheTtl });
}

function properNounCandidatesFromText(chineseText) {
  const candidates = [];
  const runs = chineseText.match(/[\u3400-\u9fff]{2,18}/g) ?? [];
  runs.forEach((run) => {
    for (let end = 2; end <= run.length; end += 1) {
      const maxLength = Math.min(8, end);
      for (let length = maxLength; length >= 2; length -= 1) {
        const term = run.slice(end - length, end);
        if (commonProperNounFalsePositives.has(term) || !landmarkSuffixPattern.test(term)) continue;
        candidates.push(term);
      }
    }
  });
  return uniqueList(candidates.sort((left, right) => right.length - left.length), 12);
}

function normalizeWikidataEnglishLabel(term, label) {
  if (term === "美景宫" && /belvedere/i.test(label)) return "Belvedere";
  return label;
}

async function queuedWikidataFetch(url) {
  const run = wikidataQueue.catch(() => {}).then(async () => {
    const waitMs = Math.max(0, 25 - (Date.now() - lastWikidataRequestAt));
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastWikidataRequestAt = Date.now();
    return fetch(url, {
      headers: {
        Accept: "application/sparql-results+json",
        "User-Agent": "bilingual-ime-prototype/1.0 (proper noun lookup)",
      },
    });
  });
  wikidataQueue = run.catch(() => {});
  return run;
}

export async function fetchProperNounTranslation(chineseText) {
  const terms = properNounCandidatesFromText(chineseText);
  const results = new Map();
  const missing = [];

  terms.forEach((term) => {
    const cached = cachedProperNoun(term);
    if (cached === null) missing.push(term);
    else if (cached) results.set(term, cached);
  });

  if (!missing.length) return results;

  try {
    const values = missing.map((term) => `"${escapeSparqlString(term)}"@zh`).join(" ");
    const sparql = `
      SELECT ?zhLabel ?itemLabel WHERE {
        VALUES ?zhLabel { ${values} }
        ?item rdfs:label ?zhLabel.
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
      LIMIT ${missing.length}
    `;
    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`;
    const wikidataResponse = await queuedWikidataFetch(url);
    if (!wikidataResponse.ok) throw new Error(`Wikidata ${wikidataResponse.status}`);
    const data = await wikidataResponse.json();
    const rows = data.results?.bindings ?? [];
    rows.forEach((row) => {
      const term = row.zhLabel?.value;
      const label = row.itemLabel?.value;
      if (!term || !label || hasChinese(label)) return;
      const normalizedLabel = normalizeWikidataEnglishLabel(term, label);
      results.set(term, normalizedLabel);
      cacheProperNoun(term, normalizedLabel);
    });
    [...results.keys()].forEach((term) => {
      if ([...results.keys()].some((otherTerm) => otherTerm !== term && otherTerm.includes(term))) {
        results.delete(term);
        cacheProperNoun(term, "");
      }
    });
    missing
      .filter((term) => !results.has(term))
      .forEach((term) => cacheProperNoun(term, ""));
  } catch (error) {
    console.warn("Wikidata proper noun lookup failed.");
  }

  return results;
}

function normalizeClientGlossary(entries, targetLanguage) {
  if (!Array.isArray(entries)) return [];
  const seen = new Set();
  return entries
    .map((entry) => ({
      zh: typeof entry.zh === "string" ? entry.zh.trim().slice(0, 40) : "",
      target: typeof entry.target === "string" ? entry.target.trim().slice(0, 100) : "",
      domain: typeof entry.domain === "string" ? entry.domain.trim().slice(0, 32) : "general",
      source: entry.source === "user" ? "user" : "seed",
    }))
    .filter((entry) => entry.zh && entry.target && /[\u3400-\u9fff]/.test(entry.zh))
    .filter((entry) => targetLanguage !== "en" || !hasChinese(entry.target))
    .filter((entry) => {
      const key = `${targetLanguage}:${entry.zh}:${entry.target}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
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
  const style = translationStyleInstructions[body.style] ? body.style : "daily";
  const context = typeof body.context === "string" ? body.context.slice(0, 600) : "";
  const texts = [...new Set(Array.isArray(body.texts) ? body.texts : [])]
    .filter((text) => typeof text === "string" && text.length > 0 && text.length <= 80)
    .slice(0, 5);

  if (!supportedLanguages[targetLanguage] || !texts.length) return json(response, { error: "Invalid translation request" }, 400);
  const glossary = phraseTranslations[targetLanguage] ?? {};
  const localResults = Object.fromEntries(texts
    .filter((text) => glossary[text])
    .map((text) => [text, glossary[text]])
    .filter(([, translation]) => targetLanguage !== "en" || !hasChinese(translation)));
  const remoteTexts = texts.filter((text) => !localResults[text]);

  if (!remoteTexts.length) return json(response, { translations: localResults });
  if (!process.env.OPENAI_API_KEY) return json(response, { error: "Translation service is not configured" }, 503);

  const clientGlossary = normalizeClientGlossary(body.glossaryEntries, targetLanguage);
  const properNounGlossary = targetLanguage === "en"
    ? [...(await fetchProperNounTranslation(remoteTexts.join("\n")))].map(([zh, target]) => ({
        zh,
        target,
        alternatives: [],
        domain: "proper-noun",
        matchedTerm: zh,
      }))
    : [];
  const relevantGlossary = [
    ...clientGlossary,
    ...properNounGlossary
      .filter((entry) => !clientGlossary.some((clientEntry) => clientEntry.zh === entry.zh)),
    ...getRelevantGlossary(remoteTexts, targetLanguage)
      .filter((entry) => !clientGlossary.some((clientEntry) => clientEntry.zh === entry.zh)
        && !properNounGlossary.some((properNounEntry) => properNounEntry.zh === entry.zh)),
  ];
  const prompt = [
    `Translate every Simplified Chinese item into ${supportedLanguages[targetLanguage]}.`,
    mode === "final"
      ? "These are completed sentences. Rewrite them as natural, context-aware output. Preserve the meaning and tone; do not translate word-for-word when a native phrase is better."
      : "Use concise, natural wording for a bilingual writing/IME demo. Do not translate word-for-word when a native phrase is better.",
    terminologyPriorityInstruction,
    translationStyleInstructions[style],
    style === "formal"
      ? "For formal English, make the register visibly different from daily English: choose elevated diction, vary clause structure, and avoid plain chat-like verbs unless no formal alternative is natural. Do not sacrifice term accuracy for ornamentation."
      : "",
    style === "technical"
      ? "For technical English, prefer the shortest accurate professional wording. Use established military, engineering, UI/UX, automotive, device, and product terms; do not use poetic or dramatic language."
      : "",
    style === "daily"
      ? "For daily English, sound natural and fluent, using common idioms and everyday American phrasing when they convey the Chinese meaning better than literal translation."
      : "",
    "Prefer everyday American English for daily English output. Keep professional UI/UX, product-design, military, automotive, device, movie, history, education, and business terms precise whenever those domains appear.",
    "Relevant domains include UI/UX design, product design, design systems, interaction design, visual design, cars, phones/devices, movies, history, daily life, and English learning.",
    "When translating to English, output English punctuation, avoid Chinese punctuation, preserve standard product spacing such as Mate 70 Pro, and do not repeat the same sentence.",
    mode === "final"
      ? "For completed English sentences, make omitted subjects explicit when needed, choose idiomatic domain wording over literal noun chains, use natural time expressions, and keep rhetorical or emotional force."
      : "For candidate words or unfinished fragments, keep the output short and literal enough to help selection.",
    mode === "final" && targetLanguage === "en"
      ? "If the source is a short rhetorical question or headline, produce a concise headline-style question, not a full explanatory sentence. Prefer US or America over the United States in headlines when natural."
      : "",
    mode === "final" && targetLanguage === "en"
      ? "For domain concepts with established English usage, use the established English term or a natural quoted calque instead of a literal dictionary phrase. If the Chinese wording names an idea, policy, school, genre, or trend, it is acceptable to keep it compact in quotes."
      : "",
    mode === "final" && targetLanguage === "en"
      ? "Translate Chinese idioms and evaluative phrases by function: use natural English constructions such as a dead end, lead nowhere, doomed to fail, a scam, a trap, or a bubble when they match the tone, instead of preserving the original syntax."
      : "",
    context ? `Use this surrounding Chinese context when it helps: ${context}` : "",
    relevantGlossary.length
      ? `Glossary constraints. Use these translations for matching terms when they appear in the source; user entries and edited translations override defaults and style rules: ${JSON.stringify(relevantGlossary)}`
      : "",
    properNounGlossary.length
      ? `Proper noun constraints. These are mandatory standard names from Wikidata: ${properNounGlossary.map((entry) => `${entry.zh} 必须翻译为 ${entry.target}`).join("; ")}`
      : "",
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
    let translations = Object.fromEntries(remoteTexts
      .filter((text) => typeof result[text] === "string")
      .map((text) => [text, polishTranslation(result[text], targetLanguage)]));
    const mixedEnglishEntries = targetLanguage === "en"
      ? Object.entries(translations).filter(([, translation]) => hasChinese(translation))
      : [];

    if (mixedEnglishEntries.length) {
      const repairPrompt = [
        "Repair these Simplified Chinese to English translations.",
        "Every value must be fluent natural English only. Do not leave any Chinese characters in the output.",
        "Return only a JSON object using the same original Chinese keys.",
        JSON.stringify(Object.fromEntries(mixedEnglishEntries)),
      ].join("\n");
      const repairResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-5-nano",
          reasoning: { effort: "minimal" },
          input: [{ role: "user", content: [{ type: "input_text", text: repairPrompt }] }],
          max_output_tokens: 120,
        }),
      });
      if (repairResponse.ok) {
        try {
          const repairData = await repairResponse.json();
          const repairRaw = readOutputText(repairData).replace(/^```json\s*|\s*```$/g, "");
          const repairResult = JSON.parse(repairRaw);
          translations = Object.fromEntries(Object.entries(translations).map(([text, translation]) => {
            const repaired = typeof repairResult[text] === "string" ? polishTranslation(repairResult[text], targetLanguage) : translation;
            return [text, hasChinese(repaired) ? translation : repaired];
          }));
        } catch {
          console.warn("English translation repair response could not be read.");
        }
      }
      translations = Object.fromEntries(Object.entries(translations).filter(([, translation]) => !hasChinese(translation)));
    }
    return json(response, { translations: { ...localResults, ...translations } });
  } catch {
    console.error("OpenAI translation response could not be read", outputText);
    return json(response, { error: "Translation response could not be read" }, 502);
  }
}
