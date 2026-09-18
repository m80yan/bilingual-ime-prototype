import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { domainGlossarySeedEntries, normalizeGlossaryPinyin } from "../src/data/domainGlossarySeed.js";

const outputUrl = new URL("../src/data/generatedDomainGlossarySeed.json", import.meta.url);
const reportUrl = new URL("../src/data/generatedDomainGlossarySeed.report.json", import.meta.url);
const maxEntries = Number(process.env.GLOSSARY_SEED_LIMIT) || 5000;
const weight = Number(process.env.GLOSSARY_SEED_WEIGHT) || 80;

const thuoclSources = [
  { domain: "technology", url: "https://raw.githubusercontent.com/thunlp/THUOCL/master/data/THUOCL_IT.txt" },
  { domain: "business", url: "https://raw.githubusercontent.com/thunlp/THUOCL/master/data/THUOCL_caijing.txt" },
  { domain: "auto", url: "https://raw.githubusercontent.com/thunlp/THUOCL/master/data/THUOCL_car.txt" },
  { domain: "medical", url: "https://raw.githubusercontent.com/thunlp/THUOCL/master/data/THUOCL_medical.txt" },
  { domain: "place", url: "https://raw.githubusercontent.com/thunlp/THUOCL/master/data/THUOCL_diming.txt" },
  { domain: "general", url: "https://raw.githubusercontent.com/thunlp/THUOCL/master/data/THUOCL_chengyu.txt" },
  { domain: "general", url: "https://raw.githubusercontent.com/thunlp/THUOCL/master/data/THUOCL_law.txt" },
];

const phrasePinyinSources = [
  "https://raw.githubusercontent.com/mozillazg/phrase-pinyin-data/master/large_pinyin.txt",
  "https://raw.githubusercontent.com/mozillazg/phrase-pinyin-data/master/pinyin.txt",
  "https://raw.githubusercontent.com/mozillazg/phrase-pinyin-data/master/cc_cedict.txt",
];

const stopwords = new Set([
  "一个", "一种", "一些", "一样", "这个", "那个", "这里", "那里", "我们", "你们", "他们", "它们",
  "自己", "可以", "没有", "不是", "进行", "由于", "因为", "所以", "但是", "如果", "需要", "问题",
  "时候", "已经", "可能", "通过", "以及", "对于", "关于", "其中", "目前", "成为", "作为", "相关",
  "上海", "三洋", "亚军", "三炮", "人海", "全港", "来港", "凌海", "余车", "便车",
]);
const domainPatterns = [
  { domain: "military", pattern: /(军|战|舰|艇|炮|枪|弹|雷达|导弹|鱼雷|航空母舰|航母|潜艇|驱逐舰|巡洋舰|战列舰|登陆艇|补给舰|护卫舰|少尉|中尉|上尉|舰长|司令|部队|武器|装甲|坦克|步兵|空军|海军|陆军|雷达|声呐|声纳)/ },
  { domain: "marine", pattern: /(船|舰|艇|港|海|洋|航|帆|桨|锚|舵|甲板|船舱|舷|码头|航线|航行|轮船|货轮|邮轮|渡轮|潜水|浮标|水手|船长|船员|海峡|海湾|海岸|海域)/ },
  { domain: "auto", pattern: /(车|汽车|发动机|变速|底盘|轮胎|刹车|制动|电池|油耗|涡轮|悬挂|驾驶|方向盘|离合|车身|车载|车机|续航|汽油|柴油)/ },
  { domain: "technology", pattern: /(软件|硬件|算法|芯片|网络|数据|系统|接口|服务器|模型|代码|平台|计算|智能|程序|数据库|协议|传感器|电路|引擎|机械|电子|电机|螺旋桨)/ },
  { domain: "business", pattern: /(银行|基金|股票|证券|融资|利率|投资|财务|资产|债券|期货|贷款|上市|公司|市场|交易|收入|成本|利润|资本)/ },
  { domain: "medical", pattern: /(医院|疾病|治疗|药物|临床|细胞|感染|手术|症状|患者|诊断|病毒|疫苗|肿瘤|血液|神经|免疫)/ },
];

const toneMap = new Map(Object.entries({
  ā: "a", á: "a", ǎ: "a", à: "a", ē: "e", é: "e", ě: "e", è: "e",
  ī: "i", í: "i", ǐ: "i", ì: "i", ō: "o", ó: "o", ǒ: "o", ò: "o",
  ū: "u", ú: "u", ǔ: "u", ù: "u", ǖ: "v", ǘ: "v", ǚ: "v", ǜ: "v",
  ü: "v", ń: "n", ň: "n", "": "m",
}));

function stripTone(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüńň]/g, (char) => toneMap.get(char) ?? char)
    .replace(/u:/g, "v")
    .replace(/[^a-zA-Z]/g, "")
    .toLowerCase();
}

function isChineseTerm(term) {
  return /^[\u3400-\u9fff]{2,8}$/.test(term) && !stopwords.has(term);
}

function cleanDefinition(definition) {
  return definition
    .replace(/\([^)]*?\)/g, "")
    .replace(/\[[^\]]*?\]/g, "")
    .replace(/\bCL:.*/i, "")
    .replace(/\bvariant of\b.*$/i, "")
    .replace(/\bold variant of\b.*$/i, "")
    .replace(/\s+/g, " ")
    .replace(/\s*;\s*/g, "; ")
    .trim();
}

function usefulDefinitionForDomain(definition, domain) {
  if (!definition || /\bsee\s+[\u3400-\u9fff]/i.test(definition)) return false;
  if (/^(surname|variant|old variant|abbr\. for)\b/i.test(definition)) return false;
  if (domain === "military") return /\b(war|army|military|naval|navy|combat|weapon|soldier|officer|captain|lieutenant|bullet|gun|rifle|missile|torpedo|submarine|destroyer|cruiser|battleship|radar|sonar|armistice|artillery)\b/i.test(definition);
  if (domain === "marine") return /\b(ship|boat|vessel|naval|navy|sea|ocean|harbor|harbour|port|anchor|sail|deck|voyage|navigation|maritime|ferry|submarine|coast|strait|waters)\b/i.test(definition);
  if (domain === "auto") return /\b(car|vehicle|automobile|auto|engine|brake|tire|tyre|wheel|drive|driver|sedan|chassis|battery|diesel|gasoline|parking)\b/i.test(definition);
  return true;
}

function domainFromTerm(term, fallback) {
  const matchedDomain = domainPatterns.find(({ pattern }) => pattern.test(term))?.domain;
  if (matchedDomain) return matchedDomain;
  return fallback;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.text();
}

async function buildPinyinIndex() {
  const index = new Map();
  for (const source of phrasePinyinSources) {
    const text = await fetchText(source);
    for (const rawLine of text.split("\n")) {
      const line = rawLine.replace(/\s+#.*$/, "").trim();
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf(":");
      if (separator < 0) continue;
      const term = line.slice(0, separator).trim();
      if (!isChineseTerm(term) || index.has(term)) continue;
      const pinyin = stripTone(line.slice(separator + 1));
      if (pinyin) index.set(term, pinyin);
    }
  }
  return index;
}

function buildCedictIndex() {
  const cedict = gunzipSync(readFileSync(new URL("../src/vendor/cc-cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz", import.meta.url))).toString("utf8");
  const index = new Map();
  for (const line of cedict.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const firstSpace = line.indexOf(" ");
    const pronunciationEnd = line.indexOf(" [", firstSpace);
    const definitionsStart = line.indexOf(" /", pronunciationEnd);
    const definitionsEnd = line.lastIndexOf("/");
    if (firstSpace < 0 || pronunciationEnd < 0 || definitionsStart < 0 || definitionsEnd <= definitionsStart) continue;

    const simplified = line.slice(firstSpace + 1, pronunciationEnd);
    if (!isChineseTerm(simplified) || index.has(simplified)) continue;
    const definitions = line.slice(definitionsStart + 2, definitionsEnd)
      .split("/")
      .map(cleanDefinition)
      .filter((definition) => definition && !/^(surname|variant|old variant)\b/i.test(definition));
    if (definitions.length) index.set(simplified, definitions.slice(0, 2).join("; "));
  }
  return index;
}

function buildKeywordCandidates(cedictIndex) {
  const candidates = new Map();
  for (const term of cedictIndex.keys()) {
    const domain = domainFromTerm(term, "");
    if (!domain || domain === "general") continue;
    const score = domain === "military" || domain === "marine" ? 10_000_000 - term.length : 1_000_000 - term.length;
    candidates.set(term, { term, domain, frequency: score, sources: ["CC-CEDICT keyword expansion"] });
  }
  return candidates;
}

async function buildThuoclCandidates() {
  const candidates = new Map();
  for (const source of thuoclSources) {
    const text = await fetchText(source.url);
    for (const line of text.split("\n")) {
      const [term, rawFrequency] = line.trim().split(/\s+/);
      if (!isChineseTerm(term)) continue;
      const frequency = Number(rawFrequency) || 0;
      const existing = candidates.get(term);
      const domain = domainFromTerm(term, source.domain);
      if (!existing || frequency > existing.frequency) {
        candidates.set(term, { term, domain, frequency, sources: [source.url] });
      } else if (existing && !existing.sources.includes(source.url)) {
        existing.sources.push(source.url);
      }
    }
  }
  return candidates;
}

function normalizeEntry(candidate, pinyinIndex, cedictIndex) {
  const pinyin = pinyinIndex.get(candidate.term);
  const en = cedictIndex.get(candidate.term);
  if (!pinyin || !en) return null;
  if (!usefulDefinitionForDomain(en, candidate.domain)) return null;
  return {
    zh: candidate.term,
    pinyin: normalizeGlossaryPinyin(pinyin),
    en,
    ja: "",
    domain: candidate.domain,
    weight,
    status: "pending_review",
    source: "THUOCL+phrase-pinyin-data+CC-CEDICT",
  };
}

const reviewedTerms = new Set(domainGlossarySeedEntries.map((entry) => entry.zh));
const pinyinIndex = await buildPinyinIndex();
const cedictIndex = buildCedictIndex();
const thuoclCandidates = await buildThuoclCandidates();
const keywordCandidates = buildKeywordCandidates(cedictIndex);
const mergedCandidates = new Map([...keywordCandidates, ...thuoclCandidates].map(([, candidate]) => [candidate.term, candidate]));
for (const [term, candidate] of thuoclCandidates) {
  const existing = mergedCandidates.get(term);
  if (!existing || candidate.frequency > existing.frequency) mergedCandidates.set(term, candidate);
}
const entries = [...mergedCandidates.values()]
  .filter((candidate) => !reviewedTerms.has(candidate.term))
  .sort((left, right) => right.frequency - left.frequency)
  .map((candidate) => normalizeEntry(candidate, pinyinIndex, cedictIndex))
  .filter(Boolean)
  .filter((entry, index, list) => list.findIndex((item) => item.zh === entry.zh || `${item.zh}:${item.pinyin}` === `${entry.zh}:${entry.pinyin}`) === index)
  .slice(0, maxEntries);

const report = {
  generatedAt: new Date().toISOString(),
  limit: maxEntries,
  sourceCounts: {
    pinyinTerms: pinyinIndex.size,
    cedictTerms: cedictIndex.size,
    thuoclTerms: thuoclCandidates.size,
    keywordTerms: keywordCandidates.size,
    generatedEntries: entries.length,
  },
  byDomain: entries.reduce((accumulator, entry) => {
    accumulator[entry.domain] = (accumulator[entry.domain] ?? 0) + 1;
    return accumulator;
  }, {}),
  samples: entries.slice(0, 30),
};

mkdirSync(new URL("../src/data/", import.meta.url), { recursive: true });
writeFileSync(outputUrl, `${JSON.stringify(entries, null, 2)}\n`);
writeFileSync(reportUrl, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Generated ${entries.length.toLocaleString()} pending glossary entries at ${outputUrl.pathname}`);
console.log(`Wrote quality report to ${reportUrl.pathname}`);
