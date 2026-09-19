const properNounCacheKey = "ime:proper-noun-cache";
const properNounCacheTtl = 24 * 60 * 60 * 1000;
const landmarkSuffixPattern = /(宫殿|大厅|广场|博物馆|美术馆|音乐厅|歌剧院|体育场|机场|车站|大学|学院|公园|花园|宫|厅|馆|院|寺|塔|桥|城|山|湖|河|岛|港|区|街|路)$/;
const commonProperNounFalsePositives = new Set(["工作", "用户", "产品", "设计", "界面", "体验", "输入", "输出", "中文", "英文", "日文", "翻译", "候选", "窗口", "文字", "内容", "句子", "词库", "模型", "大厅"]);
let wikidataQueue = Promise.resolve();
let lastWikidataRequestAt = 0;

function unique(items, limit) {
  return [...new Set(items.filter(Boolean))].slice(0, limit);
}

function readProperNounCache() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(properNounCacheKey) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeProperNounCache(cache) {
  try {
    window.localStorage.setItem(properNounCacheKey, JSON.stringify(cache));
  } catch {
    // Cache failures should never block typing or translation.
  }
}

function cachedProperNoun(term, cache) {
  const cached = cache[term];
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    delete cache[term];
    return null;
  }
  return cached.value;
}

function cacheProperNoun(term, value, cache) {
  cache[term] = { value, expiresAt: Date.now() + properNounCacheTtl };
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
  return unique(candidates.sort((left, right) => right.length - left.length), 12);
}

function escapeSparqlString(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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
      },
    });
  });
  wikidataQueue = run.catch(() => {});
  return run;
}

export async function fetchProperNounTranslation(chineseText) {
  const terms = properNounCandidatesFromText(chineseText);
  const cache = readProperNounCache();
  const results = new Map();
  const missing = [];

  terms.forEach((term) => {
    const cached = cachedProperNoun(term, cache);
    if (cached === null) missing.push(term);
    else if (cached) results.set(term, cached);
  });

  if (!missing.length) {
    writeProperNounCache(cache);
    return results;
  }

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
    const response = await queuedWikidataFetch(url);
    if (!response.ok) throw new Error(`Wikidata ${response.status}`);
    const data = await response.json();
    (data.results?.bindings ?? []).forEach((row) => {
      const term = row.zhLabel?.value;
      const label = row.itemLabel?.value;
      if (!term || !label || /[\u3400-\u9fff]/.test(label)) return;
      const normalizedLabel = normalizeWikidataEnglishLabel(term, label);
      results.set(term, normalizedLabel);
      cacheProperNoun(term, normalizedLabel, cache);
    });
    [...results.keys()].forEach((term) => {
      if ([...results.keys()].some((otherTerm) => otherTerm !== term && otherTerm.includes(term))) {
        results.delete(term);
        cacheProperNoun(term, "", cache);
      }
    });
    missing
      .filter((term) => !results.has(term))
      .forEach((term) => cacheProperNoun(term, "", cache));
    writeProperNounCache(cache);
  } catch {
    // Fall back to the normal model translation path.
  }

  return results;
}
