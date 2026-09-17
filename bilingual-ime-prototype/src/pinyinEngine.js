import { dict } from "./vendor/web-pinyin-ime/google_pinyin_dict_utf8_55320";
import { domainGlossaryPinyinIndex, normalizeGlossaryPinyin } from "./data/domainGlossarySeed";

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

function segmentedCandidates(input, limit) {
  const memo = new Map();

  function bestFrom(index) {
    if (index === input.length) return [{ text: "", score: 0 }];
    if (memo.has(index)) return memo.get(index);

    const paths = [];
    for (let end = index + 1; end <= input.length; end += 1) {
      const entries = dict[input.slice(index, end)];
      if (!entries) continue;
      for (const tail of bestFrom(end)) {
        for (const entry of [...entries].sort((left, right) => right.f - left.f).slice(0, 3)) {
          paths.push({ text: `${entry.w}${tail.text}`, score: Math.log(entry.f + 1) + tail.score - 30 });
        }
      }
    }

    const best = [...new Map(paths.map((path) => [path.text, path])).values()]
      .sort((left, right) => right.score - left.score)
      .slice(0, 24);
    memo.set(index, best);
    return best;
  }

  return bestFrom(0).map((path) => path.text).filter(Boolean).slice(0, limit);
}

function composedLongCandidates(input, limit) {
  const paths = [];

  for (let end = input.length - 1; end >= 2; end -= 1) {
    const prefix = input.slice(0, end);
    const rest = input.slice(end);
    const glossaryEntries = domainGlossaryPinyinIndex[normalizeGlossaryPinyin(prefix)] ?? [];
    const dictEntries = dict[prefix] ?? [];
    if (!glossaryEntries.length && !dictEntries.length) continue;

    const prefixEntries = [
      ...glossaryEntries.map((entry) => ({ text: entry.zh, score: 100000 + entry.zh.length * 100 })),
      ...dictEntries
        .filter((entry) => entry.w.length > 1)
        .slice()
        .sort((left, right) => right.f - left.f)
        .slice(0, 3)
        .map((entry) => ({ text: entry.w, score: Math.log(entry.f + 1) + entry.w.length * 10 })),
    ];
    if (!prefixEntries.length) continue;

    const tailCandidates = segmentedCandidates(rest, 6);
    if (!tailCandidates.length) continue;

    prefixEntries.forEach((prefixEntry) => {
      tailCandidates.forEach((tail, tailIndex) => {
        paths.push({
          text: `${prefixEntry.text}${tail}`,
          score: prefixEntry.score + input.length + prefix.length - tailIndex,
        });
      });
    });
  }

  return [...new Map(paths.map((path) => [path.text, path])).values()]
    .sort((left, right) => right.score - left.score)
    .map((path) => path.text)
    .slice(0, limit);
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
  if (dict[input]) return unique([...shortcut, ...glossary, ...preferred, ...mixedCandidates(input, limit), ...exact.slice(0, 1), ...leading, ...exact.slice(1), ...associated], limit);

  return unique([...shortcut, ...glossary, ...preferred, ...mixedCandidates(input, limit), ...composedLongCandidates(input, limit), ...leading, ...exact, ...associated, ...direct, ...segmentedCandidates(input, limit)], limit);
}

export function remainingPinyinAfterLeadingCandidate(value, candidate) {
  const input = value.toLowerCase().replace(/[^a-z]/g, "");
  const syllables = splitIntoSyllables(input);
  if (syllables.length !== 2 || candidate.length !== 1) return "";
  if (!leadingSyllableCandidates(input, 25).includes(candidate)) return "";
  return syllables.slice(1).join("");
}
