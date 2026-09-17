import { domainGlossarySeedEntries } from "../src/data/domainGlossarySeed.js";
import { imeEvaluationCases } from "../src/data/imeEvaluationCases.js";

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

const duplicateKeys = domainGlossarySeedEntries
  .map((entry) => `${entry.zh}:${normalizePinyin(entry.pinyin)}`)
  .filter((key, index, keys) => keys.indexOf(key) !== index);

if (duplicateKeys.length) failures.push(`duplicate glossary entries: ${[...new Set(duplicateKeys)].join(", ")}`);

if (failures.length) {
  console.error("IME corpus check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`IME corpus check passed: ${imeEvaluationCases.length} evaluation cases, ${domainGlossarySeedEntries.length} seed entries.`);
