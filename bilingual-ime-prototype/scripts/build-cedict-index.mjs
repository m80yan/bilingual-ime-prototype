import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const dictSource = readFileSync(new URL("../src/vendor/web-pinyin-ime/google_pinyin_dict_utf8_55320.ts", import.meta.url), "utf8");
const dictStart = dictSource.indexOf("export const dict = ") + "export const dict = ".length;
const dictEnd = dictSource.indexOf("};\n", dictStart) + 1;
const pinyinDict = JSON.parse(dictSource.slice(dictStart, dictEnd));
const pinyinWords = new Set(Object.values(pinyinDict).flat().map((entry) => entry.w));
const cedict = gunzipSync(readFileSync(new URL("../src/vendor/cc-cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz", import.meta.url))).toString("utf8");
const translations = {};

for (const line of cedict.split("\n")) {
  if (!line || line.startsWith("#")) continue;
  const firstSpace = line.indexOf(" ");
  const pronunciationEnd = line.indexOf(" [", firstSpace);
  const definitionsStart = line.indexOf(" /", pronunciationEnd);
  const definitionsEnd = line.lastIndexOf("/");
  if (firstSpace < 0 || pronunciationEnd < 0 || definitionsStart < 0 || definitionsEnd <= definitionsStart) continue;

  const simplified = line.slice(firstSpace + 1, pronunciationEnd);
  if (!pinyinWords.has(simplified)) continue;
  const definitions = line.slice(definitionsStart + 2, definitionsEnd)
    .split("/")
    .filter((definition) => definition && !definition.startsWith("CL:"));
  if (definitions.length) (translations[simplified] ??= []).push(...definitions.slice(0, 2));
}

for (const word of Object.keys(translations)) {
  translations[word] = [...new Set(translations[word])].slice(0, 3);
}

mkdirSync(new URL("../src/data/", import.meta.url), { recursive: true });
writeFileSync(new URL("../src/data/cedict-en.json", import.meta.url), `${JSON.stringify(translations)}\n`);
console.log(`Built CC-CEDICT English index for ${Object.keys(translations).length.toLocaleString()} IME words.`);
