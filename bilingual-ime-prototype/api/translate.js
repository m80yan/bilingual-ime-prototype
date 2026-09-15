const supportedLanguages = {
  en: "natural English",
  ja: "natural Japanese",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export default async function handler(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Invalid origin" }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const targetLanguage = body.targetLanguage;
  const texts = [...new Set(Array.isArray(body.texts) ? body.texts : [])]
    .filter((text) => typeof text === "string" && text.length > 0 && text.length <= 30)
    .slice(0, 5);

  if (!supportedLanguages[targetLanguage] || !texts.length) return json({ error: "Invalid translation request" }, 400);
  if (!process.env.OPENAI_API_KEY) return json({ error: "Translation service is not configured" }, 503);

  const prompt = [
    `Translate every Simplified Chinese item into ${supportedLanguages[targetLanguage]}.`,
    "Keep translations short and natural for an IME candidate list.",
    "Return only a JSON object whose keys are the original Chinese strings and values are their translations.",
    JSON.stringify(texts),
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
      temperature: 0.2,
      max_output_tokens: 180,
    }),
  });

  if (!response.ok) return json({ error: "Translation service is unavailable" }, 502);

  const data = await response.json();
  try {
    const raw = data.output_text.replace(/^```json\s*|\s*```$/g, "");
    const result = JSON.parse(raw);
    const translations = Object.fromEntries(texts
      .filter((text) => typeof result[text] === "string")
      .map((text) => [text, result[text].trim()]));
    return json({ translations });
  } catch {
    return json({ error: "Translation response could not be read" }, 502);
  }
}
