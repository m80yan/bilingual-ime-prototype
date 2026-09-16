const supportedLanguages = {
  en: "natural English",
  ja: "natural Japanese",
};

const phraseTranslations = {
  en: {
    "设计": "design",
    "设计师": "designer",
    "产品设计": "product design",
    "交互设计": "interaction design",
    "视觉设计": "visual design",
    "用户体验": "user experience",
    "用户界面": "user interface",
    "界面设计": "interface design",
    "信息架构": "information architecture",
    "设计系统": "design system",
    "组件库": "component library",
    "原型": "prototype",
    "线框图": "wireframe",
    "用户流程": "user flow",
    "用户旅程": "user journey",
    "可用性测试": "usability testing",
    "易用性": "usability",
    "无障碍": "accessibility",
    "响应式设计": "responsive design",
    "排版": "typography",
    "层级": "hierarchy",
    "留白": "white space",
    "对齐": "alignment",
    "一致性": "consistency",
    "反馈": "feedback",
    "状态": "state",
    "空状态": "empty state",
    "加载状态": "loading state",
    "错误状态": "error state",
    "动效": "motion",
    "微交互": "microinteraction",
    "设计稿": "design mockup",
    "高保真": "high fidelity",
    "低保真": "low fidelity",
  },
  ja: {
    "设计": "デザイン",
    "设计师": "デザイナー",
    "产品设计": "プロダクトデザイン",
    "交互设计": "インタラクションデザイン",
    "视觉设计": "ビジュアルデザイン",
    "用户体验": "ユーザー体験",
    "用户界面": "ユーザーインターフェース",
    "界面设计": "インターフェースデザイン",
    "信息架构": "情報設計",
    "设计系统": "デザインシステム",
    "组件库": "コンポーネントライブラリ",
    "原型": "プロトタイプ",
    "线框图": "ワイヤーフレーム",
    "用户流程": "ユーザーフロー",
    "用户旅程": "ユーザージャーニー",
    "可用性测试": "ユーザビリティテスト",
    "易用性": "ユーザビリティ",
    "无障碍": "アクセシビリティ",
    "响应式设计": "レスポンシブデザイン",
    "排版": "タイポグラフィ",
    "层级": "階層",
    "留白": "余白",
    "对齐": "整列",
    "一致性": "一貫性",
    "反馈": "フィードバック",
    "状态": "状態",
    "空状态": "空の状態",
    "加载状态": "読み込み状態",
    "错误状态": "エラー状態",
    "动效": "モーション",
    "微交互": "マイクロインタラクション",
    "设计稿": "デザインモックアップ",
    "高保真": "高忠実度",
    "低保真": "低忠実度",
  },
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
  const glossary = phraseTranslations[targetLanguage] ?? {};
  const localResults = Object.fromEntries(texts
    .filter((text) => glossary[text])
    .map((text) => [text, glossary[text]]));
  const remoteTexts = texts.filter((text) => !localResults[text]);

  if (!remoteTexts.length) return json(response, { translations: localResults });
  if (!process.env.OPENAI_API_KEY) return json(response, { error: "Translation service is not configured" }, 503);

  const prompt = [
    `Translate every Simplified Chinese item into ${supportedLanguages[targetLanguage]}.`,
    "Use concise, natural wording for a bilingual writing/IME demo. Do not translate word-for-word when a native phrase is better.",
    "Prefer everyday American English for English output. Keep professional UI/UX and product-design terms precise when the sentence is about design.",
    "Relevant domains include UI/UX design, product design, design systems, interaction design, visual design, cars, movies, daily life, and English learning.",
    `Use this glossary when relevant: ${JSON.stringify(glossary)}`,
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
      .map((text) => [text, result[text].trim()]));
    return json(response, { translations: { ...localResults, ...translations } });
  } catch {
    console.error("OpenAI translation response could not be read", outputText);
    return json(response, { error: "Translation response could not be read" }, 502);
  }
}
