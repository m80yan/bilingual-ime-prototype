import { domainGlossaryPinyinIndex, domainGlossarySeedEntries, normalizeGlossaryPinyin } from "../src/data/domainGlossarySeed.js";
import { imeEvaluationCases } from "../src/data/imeEvaluationCases.js";
import { getPinyinCandidates, remainingPinyinAfterLeadingCandidate } from "../src/pinyinEngine.js";

function normalizePinyin(value) {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

const seedByCandidate = new Map(domainGlossarySeedEntries.map((entry) => [entry.zh, entry]));
const failures = [];

for (const testCase of imeEvaluationCases) {
  const entry = seedByCandidate.get(testCase.expectedCandidate);
  if (!entry) {
    failures.push(`${testCase.input}: missing glossary entry for ${testCase.expectedCandidate}`);
    continue;
  }

  const indexedCandidates = domainGlossaryPinyinIndex[normalizeGlossaryPinyin(testCase.input)] ?? [];
  if (!indexedCandidates.some((candidate) => candidate.zh === testCase.expectedCandidate)) {
    failures.push(`${testCase.input}: pinyin index does not include ${testCase.expectedCandidate}`);
  }

  if (normalizePinyin(entry.pinyin) !== normalizePinyin(testCase.input)) {
    failures.push(`${testCase.input}: expected pinyin ${testCase.input}, got ${entry.pinyin}`);
  }

  if (entry.en !== testCase.expectedEn) {
    failures.push(`${testCase.input}: expected English "${testCase.expectedEn}", got "${entry.en}"`);
  }

  if (entry.ja !== testCase.expectedJa) {
    failures.push(`${testCase.input}: expected Japanese "${testCase.expectedJa}", got "${entry.ja}"`);
  }
}

const candidateRankingCases = [
  {
    input: "shengbidebaohaijunbowuguan",
    expectedTop: "圣彼得堡海军博物馆",
    expectedIncludes: ["圣彼得堡"],
    forbiddenTopFive: ["Shengbidebaohaijunbowuguan"],
  },
  {
    input: "chuguoliuxuexuanwenkeshangke",
    expectedTop: "出国留学",
    expectedIncludes: ["出国"],
    forbiddenTopFive: ["Chuguoliuxuexuanwenkeshangke"],
  },
  {
    input: "xingqiudazhanjihua",
    expectedTop: "星球大战计划",
    expectedIncludes: ["星球"],
  },
  {
    input: "xili",
    expectedTop: "西历",
    expectedIncludes: ["西"],
  },
  {
    input: "luoxuanjiang",
    expectedTop: "螺旋桨",
    expectedIncludes: ["螺旋"],
  },
  {
    input: "sanghai",
    expectedTop: "上海",
    expectedIncludes: ["伤害"],
  },
  {
    input: "shang",
    expectedTop: "上",
    forbiddenTopFive: ["上尉", "上船", "上市公司"],
  },
  {
    input: "shangwei",
    expectedTop: "尚未",
    expectedIncludes: ["上尉"],
  },
  {
    input: "jun",
    expectedTop: "均",
    forbiddenTopFive: ["军舰", "军队", "军官"],
  },
  {
    input: "zongguo",
    expectedTop: "中国",
  },
  {
    input: "xian",
    expectedTop: "先",
    expectedIncludes: ["西安"],
  },
  {
    input: "yilingci",
    expectedTop: "衣领",
    expectedIncludes: ["一"],
  },
];

for (const testCase of candidateRankingCases) {
  const candidates = getPinyinCandidates(testCase.input, 10);
  if (candidates[0] !== testCase.expectedTop) {
    failures.push(`${testCase.input}: expected top candidate ${testCase.expectedTop}, got ${candidates[0]}`);
  }

  for (const expected of testCase.expectedIncludes ?? []) {
    if (!candidates.includes(expected)) {
      failures.push(`${testCase.input}: expected candidates to include ${expected}`);
    }
  }

  for (const forbidden of testCase.forbiddenTopFive ?? []) {
    if (candidates.slice(0, 5).includes(forbidden)) {
      failures.push(`${testCase.input}: should not waste top slots with ${forbidden}`);
    }
  }
}

const remainingPinyinCases = [
  {
    input: "zhenbuganxiangxin",
    candidate: "真不",
    expected: "ganxiangxin",
  },
  {
    input: "xili",
    candidate: "西",
    expected: "li",
  },
  {
    input: "yilingci",
    candidate: "一",
    expected: "lingci",
  },
  {
    input: "yiliangcile",
    candidate: "一两",
    expected: "cile",
  },
];

const extendedCandidateCases = [
  {
    input: "wei",
    limit: 80,
    expectedIncludes: ["尉"],
  },
];

for (const testCase of remainingPinyinCases) {
  const actual = remainingPinyinAfterLeadingCandidate(testCase.input, testCase.candidate);
  if (actual !== testCase.expected) {
    failures.push(`${testCase.input}: expected remaining pinyin ${testCase.expected} after ${testCase.candidate}, got ${actual || "(empty)"}`);
  }
}

for (const testCase of extendedCandidateCases) {
  const candidates = getPinyinCandidates(testCase.input, testCase.limit);
  for (const expected of testCase.expectedIncludes) {
    if (!candidates.includes(expected)) {
      failures.push(`${testCase.input}: expected extended candidates to include ${expected}`);
    }
  }
}

const duplicateKeys = domainGlossarySeedEntries
  .map((entry) => `${entry.zh}:${normalizePinyin(entry.pinyin)}`)
  .filter((key, index, keys) => keys.indexOf(key) !== index);

if (duplicateKeys.length) failures.push(`duplicate glossary entries: ${[...new Set(duplicateKeys)].join(", ")}`);

if (failures.length) {
  console.error("IME corpus check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`IME corpus check passed: ${imeEvaluationCases.length} glossary cases, ${candidateRankingCases.length} ranking cases, ${remainingPinyinCases.length} continuation cases, ${extendedCandidateCases.length} extended candidate cases, ${domainGlossarySeedEntries.length} seed entries.`);
