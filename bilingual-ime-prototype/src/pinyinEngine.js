import { dict } from "./vendor/web-pinyin-ime/google_pinyin_dict_utf8_55320.ts";
import { domainGlossaryPinyinIndex, normalizeGlossaryPinyin } from "./data/domainGlossarySeed.js";

const keys = Object.keys(dict);
const syllableKeys = new Set(keys.filter((key) => key.length <= 6 && dict[key]?.some((item) => item.w.length === 1)));
const shortcutCandidates = {
  szm: ["首字母", "是怎么", "说这么", "上周末", "说怎么"],
  jintwoxiangshuoyijianshi: ["今天我想说一件事"],
  jtwxsyjs: ["今天我想说一件事"],
};
const preferredSyllableCandidates = {
  xi: ["西"],
  li: ["历"],
};
const fuzzyInitialPairs = [["s", "sh"], ["z", "zh"], ["c", "ch"]];
const fuzzyFinalPairs = [["an", "ang"], ["en", "eng"], ["in", "ing"]];

function unique(items, limit) {
  return [...new Set(items.filter(Boolean))].slice(0, limit);
}

function associatedPrefixCandidates(input, exactCandidates, limit) {
  const topExact = exactCandidates[0];
  if (!topExact || topExact.length < 2) return [];
  const suggestions = [];

  for (let length = topExact.length - 1; length >= 1; length -= 1) {
    suggestions.push(topExact.slice(0, length));
  }

  return unique(suggestions, limit);
}

function rankedDictEntries(key, limit = 4) {
  return (dict[key] ?? [])
    .slice()
    .sort((left, right) => right.f - left.f)
    .slice(0, limit);
}

function entryScore(entry, pinyin) {
  const phraseBonus = entry.w.length > 1 ? entry.w.length * 18 : 0;
  const fullPinyinBonus = pinyin.length > 6 ? Math.min(30, pinyin.length) : 0;
  return Math.log(entry.f + 1) + phraseBonus + fullPinyinBonus;
}

function leadingSyllableCandidates(input, limit) {
  const syllables = splitIntoSyllables(input);
  if (syllables.length !== 2) return [];
  return unique(
    [...(preferredSyllableCandidates[syllables[0]] ?? []), ...(dict[syllables[0]] ?? [])
      .slice()
      .sort((left, right) => right.f - left.f)
      .map((item) => item.w)],
    limit,
  );
}

function fuzzySyllableVariants(syllable) {
  const variants = new Set([syllable]);

  fuzzyInitialPairs.forEach(([shortInitial, longInitial]) => {
    [...variants].forEach((variant) => {
      if (variant.startsWith(longInitial)) variants.add(`${shortInitial}${variant.slice(longInitial.length)}`);
      else if (variant.startsWith(shortInitial)) variants.add(`${longInitial}${variant.slice(shortInitial.length)}`);
    });
  });

  fuzzyFinalPairs.forEach(([shortFinal, longFinal]) => {
    [...variants].forEach((variant) => {
      if (variant.endsWith(longFinal)) variants.add(`${variant.slice(0, -longFinal.length)}${shortFinal}`);
      else if (variant.endsWith(shortFinal)) variants.add(`${variant.slice(0, -shortFinal.length)}${longFinal}`);
    });
  });

  return [...variants].filter((variant) => syllableKeys.has(variant)).slice(0, 6);
}

function fuzzyPinyinVariants(input, limit = 18) {
  const syllables = splitIntoSyllables(input);
  if (!syllables.length) return [];

  const variants = [];
  function build(index, parts) {
    if (variants.length >= limit) return;
    if (index === syllables.length) {
      const candidate = parts.join("");
      if (candidate !== input) variants.push(candidate);
      return;
    }
    fuzzySyllableVariants(syllables[index]).forEach((variant) => build(index + 1, [...parts, variant]));
  }

  build(0, []);
  return unique(variants, limit);
}

function fuzzyCandidates(input, limit) {
  const matches = fuzzyPinyinVariants(input)
    .flatMap((variant) => [
      ...domainGlossaryCandidates(variant, limit),
      ...rankedDictEntries(variant, 4).map((entry) => entry.w),
    ]);
  return unique(matches, limit);
}

function segmentedCandidates(input, limit) {
  return segmentedCandidatePaths(input, limit).map((path) => path.text);
}

function segmentedCandidatePaths(input, limit) {
  const memo = new Map();

  function bestFrom(index) {
    if (index === input.length) return [{ text: "", score: 0, segments: 0, singleChars: 0 }];
    if (memo.has(index)) return memo.get(index);

    const paths = [];
    for (let end = index + 1; end <= input.length; end += 1) {
      const pinyin = input.slice(index, end);
      const entries = rankedDictEntries(pinyin, 4);
      if (!entries) continue;
      for (const tail of bestFrom(end)) {
        for (const entry of entries) {
          const isSingleChar = entry.w.length === 1;
          paths.push({
            text: `${entry.w}${tail.text}`,
            score: entryScore(entry, pinyin) + tail.score - 18 - (isSingleChar ? 28 : 0),
            segments: tail.segments + 1,
            singleChars: tail.singleChars + (isSingleChar ? 1 : 0),
          });
        }
      }
    }

    const best = [...new Map(paths.map((path) => [path.text, path])).values()]
      .sort((left, right) => right.score - left.score)
      .slice(0, 36);
    memo.set(index, best);
    return best;
  }

  return bestFrom(0).filter((path) => path.text).slice(0, limit);
}

function pinyinIndexCandidates(input) {
  const glossaryEntries = domainGlossaryPinyinIndex[normalizeGlossaryPinyin(input)] ?? [];
  const dictEntries = isCompletePinyinSequence(input) ? rankedDictEntries(input, 4) : [];
  return [
    ...glossaryEntries.map((entry) => ({ text: entry.zh, score: 100000 + entry.zh.length * 100 })),
    ...dictEntries.map((entry) => ({ text: entry.w, score: entryScore(entry, input) })),
  ];
}

function isCompletePinyinSequence(input) {
  return splitIntoSyllables(input).join("") === input;
}

function stablePrefixCandidates(input, limit) {
  const paths = [];
  for (let end = input.length - 1; end >= 2; end -= 1) {
    const prefix = input.slice(0, end);
    const rest = input.slice(end);
    if (rest.length < 2) continue;
    pinyinIndexCandidates(prefix)
      .filter((entry) => entry.text.length > 1)
      .forEach((entry) => {
        paths.push({ text: entry.text, score: entry.score + prefix.length });
      });
  }

  return [...new Map(paths.map((path) => [path.text, path])).values()]
    .sort((left, right) => right.score - left.score)
    .map((path) => path.text)
    .slice(0, limit);
}

function composedLongCandidates(input, limit) {
  const paths = [];
  const stablePrefixes = [];

  for (let end = input.length - 1; end >= 2; end -= 1) {
    const prefix = input.slice(0, end);
    const rest = input.slice(end);
    const prefixEntries = pinyinIndexCandidates(prefix).filter((entry) => entry.text.length > 1);
    if (!prefixEntries.length) continue;
    prefixEntries.forEach((prefixEntry) => {
      stablePrefixes.push({ text: prefixEntry.text, score: prefixEntry.score + prefix.length });
    });

    const tailCandidates = segmentedCandidatePaths(rest, 8)
      .filter((tail) => tail.segments <= 4 && tail.singleChars <= 1);
    if (!tailCandidates.length) continue;

    prefixEntries.forEach((prefixEntry) => {
      tailCandidates.forEach((tail, tailIndex) => {
        paths.push({
          text: `${prefixEntry.text}${tail.text}`,
          score: prefixEntry.score + tail.score + input.length + prefix.length - tailIndex,
        });
      });
    });
  }

  const composed = [...new Map(paths.map((path) => [path.text, path])).values()]
    .sort((left, right) => right.score - left.score)
    .map((path) => path.text)
    .slice(0, limit);
  const prefixes = [...new Map(stablePrefixes.map((path) => [path.text, path])).values()]
    .sort((left, right) => right.score - left.score)
    .map((path) => path.text)
    .slice(0, Math.max(0, limit - composed.length));
  return unique([...composed.slice(0, 1), ...prefixes, ...composed.slice(1)], limit);
}

function splitIntoSyllables(input) {
  const memo = new Map();

  function splitFrom(index) {
    if (index === input.length) return [[]];
    if (memo.has(index)) return memo.get(index);

    const paths = [];
    for (let end = Math.min(input.length, index + 6); end > index; end -= 1) {
      const syllable = input.slice(index, end);
      if (!syllableKeys.has(syllable)) continue;
      splitFrom(end).forEach((tail) => paths.push([syllable, ...tail]));
    }
    memo.set(index, paths.slice(0, 8));
    return memo.get(index);
  }

  return splitFrom(0)[0] ?? [];
}

function mixedInputPattern(input) {
  const memo = new Map();

  function splitFrom(index) {
    if (index === input.length) return [[]];
    if (memo.has(index)) return memo.get(index);

    const paths = [];
    for (let end = Math.min(input.length, index + 6); end > index + 1; end -= 1) {
      const syllable = input.slice(index, end);
      if (!syllableKeys.has(syllable)) continue;
      splitFrom(end).forEach((tail) => paths.push([syllable, ...tail]));
    }
    splitFrom(index + 1).forEach((tail) => paths.push([input[index], ...tail]));
    memo.set(index, paths.slice(0, 16));
    return memo.get(index);
  }

  return splitFrom(0).find((parts) => parts[0]?.length > 1 && parts.some((part) => part.length === 1));
}

function mixedCandidates(input, limit) {
  const pattern = mixedInputPattern(input);
  if (!pattern) return [];

  const matches = keys
    .filter((key) => key.startsWith(pattern[0]))
    .flatMap((key) => {
      const syllables = splitIntoSyllables(key);
      if (syllables.length !== pattern.length || !pattern.every((part, index) => syllables[index].startsWith(part))) return [];
      return dict[key];
    })
    .sort((left, right) => right.f - left.f)
    .map((item) => item.w);

  return unique(matches, limit);
}

function domainGlossaryCandidates(input, limit) {
  return unique(
    (domainGlossaryPinyinIndex[normalizeGlossaryPinyin(input)] ?? [])
      .map((entry) => entry.zh),
    limit,
  );
}

export function getPinyinCandidates(value, limit = 25) {
  const spacedInput = value.toLowerCase().trim().replace(/\s+/g, " ");
  const input = value.toLowerCase().replace(/[^a-z]/g, "");
  if (!input) return [];

  const shortcut = shortcutCandidates[input] ?? shortcutCandidates[spacedInput.replace(/[^a-z]/g, "")] ?? [];
  const glossary = domainGlossaryCandidates(input, limit);
  const preferred = preferredSyllableCandidates[input] ?? [];
  const matches = dict[input]
    ? dict[input]
    : keys.filter((key) => key.startsWith(input)).flatMap((key) => dict[key]);

  const direct = unique(
    matches
      .filter(Boolean)
      .sort((left, right) => right.f - left.f)
      .map((item) => item.w),
    limit,
  );
  const exact = dict[input] ? direct : [];
  const associated = dict[input] ? associatedPrefixCandidates(input, exact, limit) : [];
  const leading = leadingSyllableCandidates(input, limit);
  const fuzzy = fuzzyCandidates(input, limit);
  if (dict[input]) return unique([...shortcut, ...glossary, ...preferred, ...exact.slice(0, 1), ...leading, ...exact.slice(1), ...associated, ...fuzzy], limit);

  if (input.length >= 12) {
    if (glossary.length) {
      return unique([...shortcut, ...glossary, ...mixedCandidates(input, limit), ...stablePrefixCandidates(input, limit), ...fuzzy], limit);
    }
    const segmented = segmentedCandidatePaths(input, limit)
      .filter((path) => path.segments <= 6 && path.singleChars <= 2)
      .map((path) => path.text);
    const composed = composedLongCandidates(input, limit);
    return unique([...shortcut, ...glossary, ...mixedCandidates(input, limit), ...composed.slice(0, 2), ...stablePrefixCandidates(input, limit), ...fuzzy, ...segmented], limit);
  }

  return unique([...shortcut, ...glossary, ...preferred, ...mixedCandidates(input, limit), ...fuzzy, ...composedLongCandidates(input, limit), ...leading, ...exact, ...associated, ...direct, ...segmentedCandidates(input, limit)], limit);
}

export function remainingPinyinAfterLeadingCandidate(value, candidate) {
  const input = value.toLowerCase().replace(/[^a-z]/g, "");
  const syllables = splitIntoSyllables(input);
  if (syllables.length !== 2 || candidate.length !== 1) return "";
  if (!leadingSyllableCandidates(input, 25).includes(candidate)) return "";
  return syllables.slice(1).join("");
}
