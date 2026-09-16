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
  const texts = [...new Set(Array.isArray(body.texts) ? body.texts : [])]
    .filter((text) => typeof text === "string" && text.length > 0 && text.length <= 80)
    .slice(0, 5);

  if (!supportedLanguages[targetLanguage] || !texts.length) return json(response, { error: "Invalid translation request" }, 400);
  if (!process.env.OPENAI_API_KEY) return json(response, { error: "Translation service is not configured" }, 503);

  const prompt = [
    `Translate every Simplified Chinese item into ${supportedLanguages[targetLanguage]}.`,
    "Keep translations short and natural for an IME candidate list.",
    "Return only a JSON object whose keys are the original Chinese strings and values are their translations.",
    JSON.stringify(texts),
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
    const translations = Object.fromEntries(texts
      .filter((text) => typeof result[text] === "string")
      .map((text) => [text, result[text].trim()]));
    return json(response, { translations });
  } catch {
    console.error("OpenAI translation response could not be read", outputText);
    return json(response, { error: "Translation response could not be read" }, 502);
  }
}
