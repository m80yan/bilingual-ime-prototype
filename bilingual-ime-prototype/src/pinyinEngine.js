import { dict } from "./vendor/web-pinyin-ime/google_pinyin_dict_utf8_55320";

const keys = Object.keys(dict);
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

export function getPinyinCandidates(value, limit = 5) {
  const input = value.toLowerCase().replace(/[^a-z]/g, "");
  if (!input) return [];

  const matches = dict[input]
    ? dict[input]
    : keys.filter((key) => key.startsWith(input)).flatMap((key) => dict[key]);

  const direct = [...new Set(
    matches
      .filter(Boolean)
      .sort((left, right) => right.f - left.f)
      .map((item) => item.w),
  )].slice(0, limit);

  return direct.length ? direct : segmentedCandidates(input, limit);
}
